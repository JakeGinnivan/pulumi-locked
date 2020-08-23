/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-var-requires */
// @ts-check

const fs = require('fs')
const path = require('path')
const execa = require('execa')
const AWS = require('aws-sdk')
const yaml = require('js-yaml')
const DynamoDBLockClient = require('dynamodb-lock-client')

;(async () => {
    // Ensure code is built
    try {
        await execa('yarn', ['tsc', '--build'], {
            stdio: [process.stdin, process.stdout, process.stderr],
        })
    } catch (err) {
        return
    }

    const pulumiArgs = process.argv.slice(2)

    /** @type {any} */
    const doc = yaml.safeLoad(
        fs.readFileSync(path.join(process.cwd(), './Pulumi.yaml'), 'utf8'),
    )

    if (!doc.lock || !doc.lock.region || !doc.lock.table) {
        console.error(`Set lock config in Pulumi.yaml

lock:
  region: ap-southeast-2
  table: my-table`)
    }

    const { stdout, exitCode } = await execa('pulumi', ['stack', '--show-name'])
    const stackName = stdout.split(/\r?\n/)[0]
    if (!stackName) {
        console.error('Select stack with `pulumi stack select` first')
        process.exit(1)
    }

    const dynamodb = new AWS.DynamoDB.DocumentClient({
        region: doc.lock.region,
    })


    if (pulumiArgs[0] === 'release') {
        await dynamodb.delete({
            Key: {
                "id": {
                    "S": stackName
                }
            },
            TableName:doc.lock.table
        }).promise()

        console.log('Lock deleted')
        process.exit(0)
    }


    const failClosedClient = new DynamoDBLockClient.FailClosed({
        dynamodb,
        lockTable: doc.lock.table,
        partitionKey: 'id',

        acquirePeriodMs: 5000,
        // Retry for a minute
        retryCount: 12,
    })


    console.log(`Aquiring lock`)
    failClosedClient.acquireLock(stackName, async (error, lock) => {
        if (error) {
            console.error('error', error)
            process.exit(exitCode)
        }

        lock.on('error', (lockError) =>
            console.error('failed to heartbeat!', lockError),
        )

        console.log(`Aquired lock`)
        let pulumiExitCode = 0

        process.once('SIGINT', () => {
            lock.release((error) => {
                if (error) {
                    console.error(error)
                }
    
                console.log('Released lock')
                process.exit(pulumiExitCode)
            })
        })

        const pulumiSubProcess = execa('pulumi', pulumiArgs, {
            stdio: [process.stdin, process.stdout, process.stderr],
        })
        try {
            await pulumiSubProcess
        } catch (err) {
            // Just propagate the exit code, pulumi will display the error
            pulumiExitCode = pulumiSubProcess.exitCode
        }

        lock.release((error) => {
            if (error) {
                console.error(error)
            }

            console.log('Released lock')
            process.exit(pulumiExitCode)
        })
    })
})()

# pulumi-locked

Pulumi CLI wrapper which supports taking locks in DynamoDB. 

## Installation / Setup

yarn add pulumi-locked --dev


Create table, either using Pulumi or manually, the table is expected to have a partition key named `id`.

```
const stateLockTable = new aws.dynamodb.Table(`pulumi-state-lock`, {
    name: `my-dynamo-db-table-for-locks`,
    attributes: [
        {
            name: 'id',
            type: 'S',
        },
    ],
    hashKey: 'id',
    billingMode: 'PAY_PER_REQUEST',
})
```

Update `Pulumi.yaml` to put table info in

```
lock:
  region: ap-southeast-2
  table: my-table
```

## Usage

```
yarn pulumi-locked up -y
```

### Releasing a lock

If the process crashes or for some other reason there is a lock which you need to manually release, just run

```
yarn pulumi-locked release
```

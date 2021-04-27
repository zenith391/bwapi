# BW2 Sync

Serverbound: Client -> Server  
Clientbound: Server -> Client

## Clientbound

### `/api/v2/sync/recv_data` (POST)

This is sent from the server to the client (the client must also host a sync endpoint).

```json
{
    "id": 123,
    "type": "world", // or "model"
    "metadata": "world metadata in JSON",
    "source": "world source compressed with WSON then with raw deflate",
    "image": "world's thumbnail",
    "imageIcon": "model's icon"
}
```

The `source` *string* is encoded to WSON and is then compressed using raw deflate level 9, this has up to 4500% efficiency on large world, `metadata` is so small that it
would have a much lower compression efficiency.  
This command is used for:

- Sending newly created worlds/models
- Sending updated worlds/models
- Syncing worlds/models after a `/api/sync/v1/request`

`image` is equals to `false` if there is no image.

`imageIcon` is `null` if it is not a model.

## `/api/sync/v1/recv_misc` (POST)

```json
{
    "id": 123,
    "type": "user",
    "metadata": "user metadata in JSON",
    "files": {
        "abc.json": "test",
        "def.txt": "hello",
        "sub/directory/test.json": "{'cool':true}"
    },
    "image": {
        "path": "users/123.jpeg",
        "data": "..."
    }
}
```

Sync multi-file data (currently only user profiles fit into that) with an optional `image` object.  
When a profile is edited, not all files/image need to be resent.

## Serverbound

First, a mix of performance and load balancing is achieved client-side. That is the client SHOULD measure the RTT (round-trip-time) of a ping (using `/api/v2/ping`) of every server it knows, then it SHOULD add a +/- 50ms random value to ping time OR have a 10% chance of not using the best choice, and then another 10% choice of not using the second choice and so on.  
Finally it SHOULD pick the best choice (+ the 10% chance described above).

*This system has been made so that the client can benefit from more performance with a lowered ping, but load balancing was also taken into consideration in order to not always
have the same servers used and be overused.*

### `/api/v2/ping` (GET)

Always responds with:

```json
{
    "ok": true
}
```

### `/api/sync/v1/start` (GET)

Example url:

```
https://someserver.com/api/sync/v1/start?version=1
```

Example response:

```json
{
    "worlds": [{
        "id": 1,
        "timestamp": 12
    }, {
        "id": 2,
        "timestamp": 1400
    }, {
        "id": 1000,
        "timestamp": 1400000
    }],
    "models": [{
        "id": 1,
        "timestamp": 13
    }, {
        "id": 2,
        "timestamp": 17
    }, {
        "id": 1000,
        "timestamp": 400000
    }],
    "users": [{
        "id": 1,
        "timestamp": 3245
    }, {
        "id": 2,
        "timestamp": 4214
    }, {
        "id": 1000,
        "timestamp": 5775875
    }]
}
```

This response has a list of all worlds IDs in its `worlds` array, all models IDs in `models` array and all users IDs in `users`.
`images` and its categories contain the name of the images (they are always numerical, hence why its a number).  

### `/api/sync/v1/request` (POST)

POST query:

```json
{
    "worlds": [2, 7, 8, 132],
    "models": [3, 99, 45, 67],
    "users": [1, 2, 45, 57, 80]
}
```

This endpoint has a list of all worlds IDs in its `worlds` array.  
Data is then received when the server calls the client's `/api/sync/v1/recv_data` and `/api/sync/v1/recv_misc` endpoints.

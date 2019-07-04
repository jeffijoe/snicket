# Inventory sample

Basic CQRS + EventSourcing inventory example using Snicket, loosely based on [Greg Young's `mär` SimpleCQRS sample](https://github.com/gregoryyoung/m-r)

It features the following:

- Hydrating an aggregate from an event stream
- Writing new events to an event stream
- Basic business invariants in the "domain" code
- Retrying on wrong expected version errors
- **Projecting to a Postgres database** with checkpointing
- Graceful shutdown (drain writes before shutting down)

The `inventory` folder contains stuff relevant for the write side. `infra` has a few utilities and the initialization of the Postgres driver for the read side.

There are 2 entrypoints:

- `api.ts` (`yarn api`) — the HTTP server exposing an API to read and write inventory items
- `projector.ts` (`yarn projector`) — a super simple bare bones Postgres projector, that projects events into a Postgres table

**Disclaimer**: this code + documentation was thrown together over the course of ~3 hours, and could definitely be cleaner.

**Note**: the `snicket` package reference in `package.json` is pointing to `../..` as it's meant to be run from within the Snicket repo. This means you should `yarn && yarn build` at the root first.

If you are trying to run it with the npm version, simply remove the package reference and `npm install snicket`.

# Running

We need a Postgres server on `localhost` accepting traffic on port `20091`.

**If you have Docker**, open a new terminal window, and `cd` to the root of the Snicket repository. There, run `docker-compose up` to start a Postgres server listening on port 20091.

**If you don't have Docker**, start a Postgres server on port 20091 using whatever other approach available to you. You can also replace all occurences of 20091 with your own Postgres port if you want.

---

Run `npm run setup` — this will set up the Snicket `inventory` database in Postgres.

Then, run `npm run api` in one terminal window and `npm run projector` in another. The projector will create a basic read model in the same Postgres database for convenience.

# Trying it

Once you have it running, try sending it some requests:

**Create an item**

```bash
curl -XPOST http://localhost:1337/inventory -i -d '{"name": "Slippers"}' -H "Content-Type: application/json"
```

You can grab the ID from the response body or the `Location` header for the next requests. I've added a random UUID as a placeholder.

**Rename an item**

```bash
curl -XPOST http://localhost:1337/inventory/c0b0ca10-9552-4182-93b1-3d488dbed1b0/rename -i -d '{"name": "Cat Slippers"}' -H "Content-Type: application/json"
```

**Check in some quantity of an item**

```bash
curl -XPOST http://localhost:1337/inventory/c0b0ca10-9552-4182-93b1-3d488dbed1b0/checkin -i -d '{"count": 10 }' -H "Content-Type: application/json"
```

**Remove some count of an item**

```bash
curl -XPOST http://localhost:1337/inventory/c0b0ca10-9552-4182-93b1-3d488dbed1b0/remove -i -d '{"count": 7 }' -H "Content-Type: application/json"
```

**Deactivate an item**

```bash
curl -XPOST http://localhost:1337/inventory/c0b0ca10-9552-4182-93b1-3d488dbed1b0/deactivate -i -d '{"reason": "Item too popular, cant keep up with demand"}' -H "Content-Type: application/json"
```

And finally, **view the inventory**

```bash
curl http://localhost:1337/inventory"
```

# Author

— Jeff Hansen - [@Jeffijoe](https://twitter.com/Jeffijoe)
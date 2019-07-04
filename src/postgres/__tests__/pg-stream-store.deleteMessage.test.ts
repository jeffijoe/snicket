import { createPostgresStreamStore } from '../pg-stream-store'
import { streamStoreCfg } from '../../__helpers__/pg-stream-store-config'
import { deleteMessageTestFor } from '../../__acceptance__/stream-store.deleteMessage.test'

deleteMessageTestFor(async () => createPostgresStreamStore(streamStoreCfg))

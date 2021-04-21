import { v4 } from 'uuid'
import { NewStreamMessage } from '../types/messages'
import { range } from '../utils/array-util'

export function generateMessages(count: number) {
  return range(count).map<NewStreamMessage>((i) => {
    const msgId = v4()
    return NewStreamMessage.of(
      msgId,
      'greeting',
      { index: i, hello: 'world' },
      { me: 'ta' }
    )
  })
}

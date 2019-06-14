/**
 * Contract for a message data serializer, used for (de)serializating
 * **message data** and **metadata**.
 *
 * The default one simply calls `JSON.parse` and `JSON.stringify`.
 */
export interface MessageDataSerializer {
  /**
   * Serializes the specified data to a string.
   *
   * @param data
   */
  serialize(data: any): string
  /**
   * Deserializes the specified data string to an object.
   *
   * @param data
   */
  deserialize(data: string): any
}

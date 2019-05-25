/**
 * Setup script v1.
 */
export const SETUP_SQL = `
/**
 * Create the schema
 */
CREATE SCHEMA IF NOT EXISTS __schema__;

/**
 * Stream table. We use internal IDs as a perf boost for joining.
 */
CREATE TABLE IF NOT EXISTS __schema__.stream (
    id text NOT NULL UNIQUE,
    id_internal bigserial PRIMARY KEY,
    version integer NOT NULL DEFAULT '-1'::integer,
    position bigint NOT NULL DEFAULT '-1'::bigint,
    max_age integer DEFAULT NULL,
    max_count integer DEFAULT NULL
);

/**
 * Message sequence, starting at 0
 */
CREATE SEQUENCE IF NOT EXISTS __schema__.message_seq
  START 0
  MINVALUE 0;

/**
 * Messages table.
 */
CREATE TABLE IF NOT EXISTS __schema__.message (
    stream_id_internal bigint NOT NULL REFERENCES __schema__.stream(id_internal),
    message_id uuid NOT NULL UNIQUE,
    stream_version integer NOT NULL,
    position bigint NOT NULL PRIMARY KEY DEFAULT nextval('__schema__.message_seq'),
    created_at timestamp with time zone NOT NULL DEFAULT (now() at time zone 'utc'),
    type text NOT NULL,
    data jsonb NOT NULL,
    meta jsonb NOT NULL DEFAULT '{}',

    CONSTRAINT message_stream_id_internal_stream_version_unique UNIQUE (stream_id_internal, stream_version),
    CONSTRAINT message_stream_id_internal_message_id_unique UNIQUE (stream_id_internal, message_id)
);
ALTER SEQUENCE __schema__.message_seq
OWNED BY __schema__.message.position;

/**
 * Creates the new_stream_message type.
 */
DO $F$
begin
  create type __schema__.new_stream_message as (
    message_id uuid,
    "type" text,
    "data" jsonb,
    meta jsonb
  );
  exception
  when duplicate_object
    then null;
end $F$;

/**
 * Appends to a stream.
 */
create or replace function __schema__.append_to_stream(
  _streamId text,
  _expectedVersion int,
  _metadataStreamId text,
  _createdAt timestamp with time zone,
  _newMessages __schema__.new_stream_message []
) returns table (current_position bigint, current_version int, max_age int, max_count int) as $$
declare
  _currentVersion int;
  _streamIdInternal bigint;
  _lastPosition bigint;
  _maxAge int;
  _maxCount int;
  _msg __schema__.new_stream_message;
begin
  if _createdAt is null then
    _createdAt = now() at time zone 'utc';
  end if;

  select
    "id_internal", "version"
    into _streamIdInternal, _currentVersion
  from __schema__.stream
  where id = _streamId;

  if not found then
    /* 
      No stream yet, but we might have metadata for one, in which case we need to
      grab the maxAge and maxCount.
     */
    select __schema__.message.data->>'maxAge', __schema__.message.data->>'maxCount'
      into _maxAge, _maxCount
    from __schema__.message
      join __schema__.stream 
      on __schema__.message.stream_id_internal = __schema__.stream.id_internal
    where
      __schema__.stream.id = _metadataStreamId
    order by __schema__.message.stream_version desc
    limit 1;

    insert into __schema__.stream(id, "version", "position", "max_age", "max_count")
    values(_streamId, -1, -1, NULLIF(_maxAge, 0), NULLIF(_maxCount, 0))
    returning id_internal, __schema__.stream.max_age, __schema__.stream.max_count into _streamIdInternal, _maxAge, _maxCount;
    _currentVersion := -1;
  end if;

  if _expectedVersion != _currentVersion then
    if _expectedVersion != -2 then
      /* Treat these values as a concurrency error in code */
      return query select -9::bigint, -9, null::int, null::int;
      return;
    else
      /* Get the latest message's version in the stream */
      select stream_version into _currentVersion
      from __schema__.message
      where stream_id_internal = _streamIdInternal
      order by stream_version desc
      limit 1;
    end if;
  end if;

  foreach _msg in array _newMessages
  loop
    _currentVersion := coalesce(_currentVersion, -1) + 1;
    insert into __schema__."message"(
      "stream_id_internal",
      "message_id",
      "stream_version",
      "created_at",
      "type",
      "data",
      "meta"
    )
    values(
      _streamIdInternal,
      _msg.message_id,
      _currentVersion,
      _createdAt,
      _msg.type,
      _msg.data,
      _msg.meta
    )
    returning position into _lastPosition;
  end loop;

  update __schema__.stream
  set "version" = _currentVersion, "position" = _lastPosition
  where id_internal = _streamIdInternal
  returning __schema__.stream.max_age, __schema__.stream.max_count into _maxAge, _maxCount;
  NOTIFY new_messages;
  return query select _lastPosition, _currentVersion, _maxAge::int, _maxCount::int;
end;
$$ language plpgsql;

/**
 * Reads stream information, not messages.
 */
create or replace function __schema__.read_stream_info(
  _streamId text
) returns table (
  id text,
  stream_version int,
  "position" bigint,
  max_age integer,
  max_count integer
)
as $$
begin
  return query
  select
    __schema__.stream.id,
    __schema__.stream.version as stream_version,
    __schema__.stream.position,
    __schema__.stream.max_age,
    __schema__.stream.max_count
  from __schema__.stream
  where __schema__.stream.id = _streamId
  limit 1;
end;
$$ language plpgsql;

/**
 * Reads stream messages.
 */
create or replace function __schema__.read_stream(
  _streamId text,
  _version bigint,
  _count int,
  _forwards boolean
) returns table (
  stream_id text,
  message_id uuid,
  stream_version int,
  "position" bigint,
  created_at timestamp with time zone,
  "type" text,
  "data" jsonb,
  meta jsonb
)
as $$
declare
  _streamIdInternal bigint;
begin
  select __schema__.stream.id_internal
  into _streamIdInternal
  from __schema__.stream
  where __schema__.stream.id = _streamId;

  return query
  select
    _streamId as stream_id,
    __schema__.message.message_id,
    __schema__.message.stream_version,
    __schema__.message.position,
    __schema__.message.created_at,
    __schema__.message.type,
    __schema__.message.data,
    __schema__.message.meta
  from __schema__.message
  where (
    case 
      when _forwards then
        __schema__.message.stream_id_internal = _streamIdInternal
          and __schema__.message.stream_version >= _version
      else
        __schema__.message.stream_id_internal = _streamIdInternal
          and __schema__.message.stream_version <= _version
    end
  )
  order by (
    case
      when _forwards then
        __schema__.message.stream_version
      else
        -__schema__.message.stream_version
      end
  )
  limit _count;
end;
$$ language plpgsql;

/**
 * Reads the global head position.
 */
create or replace function __schema__.read_head_position()
returns bigint as $$
begin
  RETURN (SELECT max(__schema__.message.position) FROM __schema__.message);
end;
$$ language plpgsql;

/**
 * Reads the all-stream.
 */
create or replace function __schema__.read_all(
  _count int,
  _position bigint,
  _forwards boolean
) returns table(
    stream_id text,
    message_id uuid,
    stream_version int,
    "position" bigint,
    created_at timestamp with time zone,
    "type" text,
    "data" jsonb,
    meta jsonb
)
as $$
begin
  return query
  select
    __schema__.stream.id as stream_id,
    __schema__.message.message_id,
    __schema__.message.stream_version,
    __schema__.message.position,
    __schema__.message.created_at,
    __schema__.message.type,
    __schema__.message.data,
    __schema__.message.meta
  from __schema__.message
  inner join __schema__.stream
    on __schema__.message.stream_id_internal = __schema__.stream.id_internal
  where (
    case
      when _forwards then
        __schema__.message.position >= _position
      else
        __schema__.message.position <= _position
    end
  )
  order by (
    case
      when _forwards then
        __schema__.message.position
      else
        -__schema__.message.position
      end
  )
  limit _count;
end;
$$ language plpgsql;

/**
 * Sets stream metadata.
 */
create or replace function __schema__.set_stream_metadata(
  _streamId text,
  _metadataStreamId text,
  _expectedVersion int,
  _maxAge int,
  _maxCount int,
  _createdAt timestamp with time zone,
  _metadataMessage __schema__.new_stream_message
) returns int as $$
declare
  _currentVersion int;
  _streamUpdated int;
begin
  select current_version
  from __schema__.append_to_stream(
    _metadataStreamId,
    _expectedVersion,
    null,
    _createdAt,
    ARRAY [_metadataMessage]
  )
  into _currentVersion;

  if _currentVersion = -9 then
    return -9;
  end if;

  update __schema__.stream
  set "max_age" = NULLIF(_maxAge, 0),
      "max_count" = NULLIF(_maxCount, 0)
  where id = _metadataStreamId;

  return _currentVersion;  
end
$$ language plpgsql;
`

/**
 * Teardown script v1.
 */
export const TEARDOWN_SQL = `
DROP TABLE IF EXISTS __schema__.message;
DROP TABLE IF EXISTS __schema__.stream;
DROP FUNCTION IF EXISTS __schema__.append_to_stream(
  text,
  int, 
  text,
  timestamp with time zone,
  __schema__.new_stream_message []
) CASCADE;
DROP FUNCTION IF EXISTS __schema__.read_stream(
  text,
  bigint,
  int,
  boolean
) CASCADE;
DROP FUNCTION IF EXISTS __schema__.read_all(
  int,
  bigint,
  boolean
) CASCADE;
DROP FUNCTION IF EXISTS __schema__.read_head_position() CASCADE;
DROP FUNCTION IF EXISTS __schema__.read_stream_info(
  text
) CASCADE;
DROP FUNCTION IF EXISTS __schema__.set_stream_metadata(
 text,
 text,
 int,
 timestamp with time zone,
 __schema__.new_stream_message
) CASCADE;
DROP TYPE IF EXISTS __schema__.new_stream_message CASCADE;
DROP SCHEMA IF EXISTS __schema__;
`

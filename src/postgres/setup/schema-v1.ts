/**
 * Setup script v1.
 */
export const SETUP_SQL = `
/**
 * Create the schema
 */
CREATE SCHEMA IF NOT EXISTS __schema__;

/**
 * Add schema version as comment.
 */
COMMENT ON SCHEMA __schema__
IS '{ "snicket_pg_version": 1 }';

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
  message_id uuid NOT NULL,
  stream_version integer NOT NULL,
  position bigint NOT NULL PRIMARY KEY DEFAULT nextval('__schema__.message_seq'),
  created_at timestamp with time zone NOT NULL DEFAULT (now() at time zone 'utc'),
  type text NOT NULL,
  data json NOT NULL,
  meta json NOT NULL DEFAULT '{}',

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
    "data" json,
    meta json
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
  _currentPosition bigint;
  _maxAge int;
  _success int;
  _maxCount int;
  _msg __schema__.new_stream_message;
begin
  if _createdAt is null then
    _createdAt = now() at time zone 'utc';
  end if;

  if _expectedVersion < 0 then
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

    /* Try to insert the stream record. Ignores conflicts. */
    insert into __schema__.stream(id, "version", "position", "max_age", "max_count")
    values(_streamId, -1, -1, NULLIF(_maxAge, 0), NULLIF(_maxCount, 0))
    on conflict do nothing;
    _currentVersion := -1;
    get diagnostics _success = row_count;
  end if;

  /* 
    If the stream insert conflicted and we are expecting the stream to be empty,
    we need to check that it still is. But we only care if we are actually appending messages.
    (It's allowed to create a stream without appending messages!)

    .. ok so I realized that maybe that's not such a good idea.
    Commented it out for now. Hey, it ain't 1.0 yet!
  */
  -- if _expectedVersion = -1 /* ExpectedVersion.Empty */ then
  --   if
  --     _success = 0 and
  --     cardinality(_newMessages) > 0 and
  --     (select __schema__.stream.version
  --       from __schema__.stream
  --       where __schema__.stream.id = _streamId) > 0
  --    then
  --     raise exception 'WrongExpectedVersion';
  --   end if;
  -- end if;

  /*
    If we are using ExpectedVersion.Any, then we set the current version
    to the version of the first new message if it was already written before,
    otherwise we set it to what the stream is currently at.

    If we are using ExpectedVersion.Empty, then we set the current version to that.
    
    Otherwise, we set it to whatever we expect it to be.

    The concurrency control and idempotency check is performed after the insert completed, either
    sucessfully or with conflicts.
  */
  select 
    (case _expectedVersion
      when -2 /* ExpectedVersion.Any */
        then coalesce(
          __schema__.read_stream_version_of_message(
            __schema__.stream.id_internal,
            _newMessages[1].message_id
          ) -1,
          __schema__.stream.version
        )
      when -1 
        then -1
      else
        _expectedVersion
      end),
    __schema__.stream.position,
    __schema__.stream.id_internal
  into
    _currentVersion,
    _currentPosition,
    _streamIdInternal
  from __schema__.stream
  where __schema__.stream.id = _streamId;

  /*
    If we are expecting the version to be something specific, check that it's not
    higher than what the stream version actually is.
   */
  if (
    _expectedVersion >= 0 and (_streamIdInternal is null or (
      select __schema__.stream.version 
      from __schema__.stream 
      where __schema__.stream.id_internal = _streamIdInternal
    ) < _expectedVersion)
  ) then 
    raise exception 'WrongExpectedVersion';
  end if;

  /*
    If we are not trying to insert any messages, just end it right here and now.
   */
  if cardinality(_newMessages) = 0 then
    return query select _currentPosition, _expectedVersion, null::int, null::int;
    return;
  end if;
    
  /*
    Here we fucking go bois.
   */
  insert into __schema__.message(
    "stream_id_internal",
    "message_id",
    "stream_version",
    "created_at",
    "type",
    "data",
    "meta"
  )
  select 
    _streamIdInternal,
    m.message_id,
    _currentVersion + (row_number() over())::int,
    _createdAt,
    m."type",
    m.data,
    m.meta
  from unnest(_newMessages) m
  on conflict do nothing;
  get diagnostics _success = row_count;

  /*
    We've inserted messages and ignored conflicts because we
    want to detect them ourselves in order to make append idempotent.

    Check that the amount of messages we successfully 
    appended matches the amount of messages we wanted to append.
   */
  if _success <> cardinality(_newMessages) then
    if _expectedVersion = -2 then
      perform __schema__.enforce_idempotent_append(
        _streamIdInternal,
        _currentVersion - _success,
        _newMessages,
        _success
      );
    elseif _expectedVersion = -1 then
      perform __schema__.enforce_idempotent_append(
        _streamIdInternal,
        -1,
        _newMessages,
        _success
      );
    else
      perform __schema__.enforce_idempotent_append(
        _streamIdInternal,
        _currentVersion - _success,
        _newMessages,
        _success
      );
      /* We can end it here because we don't need to update the stream table, as no new writes should have occurred. */
      select 
        __schema__.stream.version,
        __schema__.stream.position,
        __schema__.stream.max_age,
        __schema__.stream.max_count
      into 
        _currentVersion,
        _currentPosition,
        _maxAge,
        _maxCount
      from __schema__.stream
      where __schema__.stream.id_internal = _streamIdInternal;

      return query select _currentPosition, _currentVersion, _maxAge, _maxCount;
      return;
    end if;
  end if;

  /*
    The append was successful with no conflicts, so we need to update
    the stream table. Let's fetch the latest version and position from the message table.
    */
  select
    coalesce(__schema__.message.position, -1),
    coalesce(__schema__.message.stream_version, -1)
  into
    _currentPosition,
    _currentVersion
  from __schema__.message
  where __schema__.message.stream_id_internal = _streamIdInternal
  order by __schema__.message.position desc
  limit 1;

  update __schema__.stream
  set "version" = _currentVersion, "position" = _currentPosition
  where id_internal = _streamIdInternal
  returning __schema__.stream.max_age, __schema__.stream.max_count into _maxAge, _maxCount;
  NOTIFY new_messages;
  return query select _currentPosition, _currentVersion, _maxAge::int, _maxCount::int;
end;
$$ language plpgsql;

/**
 * Enforce that an append was idempotent.
 */
create or replace function __schema__.enforce_idempotent_append(
  _streamIdInternal bigint,
  _start int,
  _newMessages __schema__.new_stream_message [],
  _success int
) returns void as $$
declare
  _storedMessageIds uuid [];
begin
  /* 
    If _start is less than 0, then the expected version is -1 which is empty.
    Because of that, we can already check whether or not new messages were written
    which they shouldn't have been if they reach this part of the code.
   */
  if _start < 0 and _success > 0 then
    raise exception 'WrongExpectedVersion';
  end if;

  _storedMessageIds := array(
    select __schema__.message.message_id
    from __schema__.message
    where __schema__.message.stream_id_internal = _streamIdInternal
      and __schema__.message.stream_version > _start
    order by __schema__.message.stream_version asc  
    limit cardinality(_newMessages)
  );
  
  if _storedMessageIds <> (select array(select n.message_id from unnest(_newMessages) n)) then
    raise exception 'WrongExpectedVersion';
  end if;
end;
$$ language plpgsql;

/**
 * Returns the stream version of the specified message ID if it exists, null otherwise.
 */
create or replace function __schema__.read_stream_version_of_message(
  _streamIdInternal bigint,
  _messageId uuid
) returns int
as $$
begin
  return (
    select __schema__.message.stream_version
    from __schema__.message
    where __schema__.message.message_id = _messageId
    and __schema__.message.stream_id_internal = _streamIdInternal
  );
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
  "position" bigint
)
as $$
begin
  return query
  select
    __schema__.stream.id,
    __schema__.stream.version as stream_version,
    __schema__.stream.position
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
  "data" json,
  meta json
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
    "data" json,
    meta json
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
 * Lists stream IDs.
 */
create or replace function __schema__.list_streams(
  _maxCount int,
  _afterIdInternal bigint
) returns table(stream_id text, id_internal bigint)
as $$
begin
  return query
  select __schema__.stream.id as stream_id, __schema__.stream.id_internal as id_internal
  from __schema__.stream
  where __schema__.stream.id_internal > _afterIdInternal
  order by __schema__.stream.id_internal asc
  limit _maxCount;
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

  update __schema__.stream
  set "max_age" = NULLIF(_maxAge, 0),
      "max_count" = NULLIF(_maxCount, 0)
  where id = _streamId;

  return _currentVersion;  
end
$$ language plpgsql;

/**
 * Deletes messages in a stream.
 */
create or replace function __schema__.delete_messages(
  _streamId text,
  _messageIds uuid []
) returns int as $$
declare
  _deletedCount int;
  _streamIdInternal int;
begin
  select __schema__.stream.id_internal
  into _streamIdInternal
  from __schema__.stream
  where __schema__.stream.id = _streamId;

  delete from __schema__.message
  where __schema__.message.stream_id_internal = _streamIdInternal
  and __schema__.message.message_id = any (_messageIds);

  return count(_messageIds);
end
$$ language plpgsql;

/**
 * Deletes messages in a stream.
 */
create or replace function __schema__.delete_stream(
  _streamId text,
  _expectedVersion int,
  _deletedStreamId text,
  _createdAt timestamp with time zone,
  _deletedStreamMessage __schema__.new_stream_message
) returns int
as $$
declare
  _streamIdInternal int;
  _latestStreamVersion int;
  _affected int;
  _found int;
begin
  /**
   * Start with the concurrency control.
   */
  select __schema__.stream.id_internal
    into _streamIdInternal
  from __schema__.stream
  where __schema__.stream.id = _streamId;
  get diagnostics _found = row_count;

  if _found = 0 then
    return 0;
  end if;

  if _expectedVersion = -1 then
    raise exception 'WrongExpectedVersion';
  elsif _expectedVersion >= 0 then
    if _streamIdInternal is null then
      raise exception 'WrongExpectedVersion';
    end if;

    select __schema__.message.stream_version 
      into _latestStreamVersion
    from __schema__.message
    where __schema__.message.stream_id_internal = _streamIdInternal
    order by __schema__.message.position desc
    limit 1;

    if _latestStreamVersion != _expectedVersion then
      raise exception 'WrongExpectedVersion';
    end if;
  end if;

  /**
   * Now that we've gotten that over with, delete the messages
   * and the stream.
   */
  delete from __schema__.message
  where __schema__.message.stream_id_internal = _streamIdInternal;

  delete from __schema__.stream
  where __schema__.stream.id_internal = _streamIdInternal;

  get diagnostics _affected = ROW_COUNT;

  if _affected > 0 then
    perform __schema__.append_to_stream(
      _deletedStreamId,
      -2,
      null,
      _createdAt,
      ARRAY [_deletedStreamMessage]
    );
  end if;

  return 0;
end
$$ language plpgsql;

/**
 * Gets scavengable messages for a stream.
 */
create or replace function __schema__.get_scavengable_stream_messages(
  _streamId text,
  _maxAge int,
  _maxCount int,
  _truncateBefore int,
  _currentTime timestamp with time zone
) returns table (message_id uuid)
as $$
declare
  _streamIdInternal int;
  _affected int;
  _messageIds uuid;
  _currentCount int;
begin
  if _currentTime is null then
    _currentTime = now() at time zone 'utc';
  end if;
  
  select __schema__.stream.id_internal
    into _streamIdInternal
  from __schema__.stream
  where __schema__.stream.id = _streamId;

  if NULLIF(_maxCount, 0) is not null then
    return query
    select __schema__.message.message_id as message_id
    from __schema__.message 
    where __schema__.message.stream_id_internal = _streamIdInternal
    and __schema__.message.message_id not in (
      select __schema__.message.message_id
      from __schema__.message
      where __schema__.message.stream_id_internal = _streamIdInternal
      order by __schema__.message.stream_version desc
      limit _maxCount
    );
  end if;

  if NULLIF(_maxAge, 0) is not null then
    return query
    select __schema__.message.message_id as message_id
    from __schema__.message
    where __schema__.message.stream_id_internal = _streamIdInternal
    and __schema__.message.created_at < (_currentTime - (_maxAge * interval '1 second'));
  end if;

  if _truncateBefore is not null then
    return query
    select __schema__.message.message_id as message_id
    from __schema__.message
    where __schema__.message.stream_id_internal = _streamIdInternal
    and __schema__.message.stream_version < _truncateBefore;
  end if;

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
DROP FUNCTION IF EXISTS __schema__.list_streams(
  int,
  bigint
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
DROP FUNCTION IF EXISTS __schema__.delete_messages(
  text,
  uuid []
) CASCADE;
DROP FUNCTION IF EXISTS __schema__.get_scavengable_stream_messages(
  text,
  int,
  int,
  int,
  timestamp with time zone
) CASCADE;
DROP FUNCTION IF EXISTS __schema__.read_stream_version_of_message(
  bigint,
  uuid
) CASCADE;
DROP FUNCTION IF EXISTS __schema__.enforce_idempotent_append(
  bigint,
  int,
  __schema__.new_stream_message [],
  int
) CASCADE;
DROP TYPE IF EXISTS __schema__.new_stream_message CASCADE;
DROP SCHEMA __schema__;
`

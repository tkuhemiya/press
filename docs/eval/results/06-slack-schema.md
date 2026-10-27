# A data model for a Slack-like chat app

A chat app looks simple from the outside: people type, messages appear. Underneath, four ideas carry almost all of the weight. A **workspace** is the tenant, the company or community that owns everything. A **channel** is a conversation space inside one workspace. A **message** is a post in a channel. A **thread** is a side conversation hanging off one message. The interesting design decisions are about how these nest, and about who is allowed to see what.

## The core tables

```er id=chat title="Workspaces, channels, messages and threads"
workspaces.id : uuid {key=yes}
workspaces.name : text
workspaces.slug : text

users.id : uuid {key=yes}
users.email : text

memberships.workspace_id : uuid {key=yes}
memberships.user_id : uuid {key=yes}
memberships.role : "owner | admin | member | guest"
memberships.display_name : text

channels.id : uuid {key=yes}
channels.workspace_id : uuid
channels.name : text
channels.kind : "public | private | dm"
channels.archived_at : timestamp

channel_members.channel_id : uuid {key=yes}
channel_members.user_id : uuid {key=yes}
channel_members.last_read_at : timestamp

messages.id : uuid {key=yes}
messages.channel_id : uuid
messages.author_id : uuid
messages.parent_id : uuid
messages.body : text
messages.created_at : timestamp
messages.edited_at : timestamp
messages.reply_count : int

reactions.message_id : uuid {key=yes}
reactions.user_id : uuid {key=yes}
reactions.emoji : text {key=yes}

memberships.workspace_id -> workspaces.id : belongs to {card=N:1}
memberships.user_id -> users.id : is {card=N:1}
channels.workspace_id -> workspaces.id : lives in {card=N:1}
channel_members.channel_id -> channels.id : joins {card=N:1}
channel_members.user_id -> users.id : member {card=N:1}
messages.channel_id -> channels.id : posted in {card=N:1}
messages.author_id -> users.id : written by {card=N:1}
messages.parent_id -> messages.id : replies to {card=N:0..1}
reactions.message_id -> messages.id : on {card=N:1}
reactions.user_id -> users.id : by {card=N:1}
```

### Users belong to workspaces through memberships

A person often belongs to several workspaces, and their name, role and avatar can differ in each. So [users](#chat.users) holds only the global identity (an email, a login), and [memberships](#chat.memberships) is the join table that says "this user is an admin in this workspace, and here they go by *Sam (Platform)*". Every permission check starts here: if there is no membership row, the user sees nothing in that workspace.

### Channels are scoped to one workspace

Each [channel](#chat.channels) has exactly one workspace. The `kind` field covers public channels, private channels and direct messages. Treating a DM as a channel with two or three members, rather than a separate table, is the decision that keeps everything else uniform: messages, threads, reactions, unread counts and search all work the same way regardless of where the message lives.

[channel_members](#chat.channel_members) records who has joined. For public channels it is a list of who gets notifications; for private channels and DMs it is also the access list. It holds `last_read_at`, which is how the app computes unread badges: count messages in the channel created after that timestamp.

### Threads are messages that point at a message

The tempting design is a separate `threads` table. It turns out to be unnecessary. A thread reply is just a message whose [parent_id](#chat.messages) points at another message in the same channel. A top-level message has a null `parent_id`. That one self-reference gives you threads for free:

- The channel view loads messages where `parent_id is null`, newest first.
- Opening a thread loads messages where `parent_id = :root`, oldest first.
- `reply_count` on the root is denormalized so the channel view can show "12 replies" without a second query.

Keep threads one level deep. Slack does not allow replies to replies, and enforcing that (a reply's parent must itself have a null `parent_id`) keeps the UI and the queries simple.

### Reactions are a small table with a composite key

A [reaction](#chat.reactions) is identified by the message, the user and the emoji together, so the same person cannot add the same emoji twice, but can add several different ones.

## What this model leaves out, on purpose

Files, mentions, pins, bookmarks and search indexes all hang off `messages` the same way reactions do, so they add tables without changing the shape. Two things do matter at scale. First, `messages` will be by far the largest table; partition or shard it by `channel_id` (or by workspace), because almost every query is "messages in this channel, in time order". Second, every table carries a workspace, directly or one hop away, and that is the tenant boundary: put `workspace_id` in every query path and you cannot accidentally leak one company's messages to another.

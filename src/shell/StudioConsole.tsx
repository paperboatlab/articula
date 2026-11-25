// The bottom card: omc's live log (Console) and the last check's messages (Messages). The kit's bottom
// Panel: hidden, it keeps its head (Ctrl J).
import { Console, Key, MessageList, Panel, Tabs, logText, messageCounts, type Log, type Message } from "@paperboatlab/ui";

export type ConsoleTab = "console" | "messages";

export function StudioConsole({ logs, messages, tab, selected, checking, hidden, onHidden, onTab, onSelect, onOpen, onCheck }: {
  logs: Log[];
  messages: Message[];
  tab: ConsoleTab;
  selected?: Message | null;
  checking?: boolean;
  hidden: boolean;
  onHidden: (hidden: boolean) => void;
  onTab: (tab: ConsoleTab) => void;
  onSelect?: (message: Message) => void;
  onOpen?: (message: Message) => void;
  onCheck: () => void;
}) {
  const counts = messageCounts(messages);
  const errors = logs.filter((l) => l.level === "error").length;
  const words = tab === "console"
    ? `${logs.length} ${logs.length === 1 ? "line" : "lines"}`
    : `${counts.error} ${counts.error === 1 ? "error" : "errors"} · ${counts.warning} ${counts.warning === 1 ? "warning" : "warnings"}`;
  return (
    <Panel name="Console" side="bottom" hidden={hidden} onHidden={onHidden} className="cons" count={words}
      head={<>
        <Tabs label="Console" value={tab} onChange={onTab} tabs={[
          { value: "console", label: "Console", count: errors || undefined },
          { value: "messages", label: "Messages", count: messages.length || undefined },
        ]} />
        <span className="tools">
          {tab === "console" && logs.length > 0 && <Key size="sm" kind="quiet" onClick={() => void navigator.clipboard?.writeText(logs.map(logText).join("\n"))}>Copy all</Key>}
          {tab === "messages" && <Key size="sm" kind="quiet" icon="check" disabled={checking} onClick={onCheck}>{checking ? "Checking…" : "Check model"}</Key>}
        </span>
      </>}>
      <div className="cons-body">
        {tab === "console"
          ? <Console logs={logs} />
          : <MessageList messages={messages} selected={selected} onSelect={onSelect} onOpen={onOpen} empty="No messages. Model › Check (Ctrl Shift C)." />}
      </div>
    </Panel>
  );
}

import { useEffect, useState } from "react";
import { api } from "../api";
import type { Message } from "../types";
import { Icon } from "../ui";

/** Masked in-app chat for one quote thread (§9). */
export function Thread({ threadId }: { threadId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");

  const load = () => api.messages(threadId).then(setMessages).catch(() => {});
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [threadId]);

  const send = async () => {
    if (!text.trim()) return;
    setErr("");
    try {
      await api.sendMessage(threadId, text.trim());
      setText("");
      load();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <div className="card">
      <h3>{Icon.chat}Messages</h3>
      {messages.length === 0 && (
        <p className="notice" style={{ marginBottom: 12 }}>
          No messages yet. Chat stays in-app — phone numbers and emails are automatically removed.
        </p>
      )}
      {messages.length > 0 && (
        <div className="thread">
          {messages.map((m) => (
            <div className={`msg ${m.sender_role}`} key={m.id}>
              <div className="meta">
                {m.sender_role}
                {m.redacted && <span className="flag" title="Contact details were removed">· masked</span>}
              </div>
              {m.body}
            </div>
          ))}
        </div>
      )}
      <div className="composer">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          placeholder="Write a message…"
        />
        <button className="btn sm" onClick={send}>Send</button>
      </div>
      {err && <p className="err">{err}</p>}
    </div>
  );
}

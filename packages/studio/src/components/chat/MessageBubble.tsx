import Markdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import type { Message } from "../../stores/sessionStore";

interface MessageBubbleProps {
  message: Message;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div data-testid={`message-${message.role}`} className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-3 ${
          isUser
            ? "bg-blue-600 text-white"
            : "bg-gray-800 text-gray-100"
        }`}
      >
        {/* Role label */}
        <div className="mb-1 flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wider opacity-70">
            {isUser ? "You" : "Assistant"}
          </span>
          <span className="text-[10px] opacity-50">
            {formatTime(message.timestamp)}
          </span>
          {message.streaming && (
            <span className="ml-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
          )}
        </div>

        {/* Content */}
        {isUser ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {message.content}
          </p>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none text-sm leading-relaxed">
            <Markdown
              rehypePlugins={[rehypeHighlight]}
              components={{
                pre: ({ children, ...props }) => (
                  <pre
                    className="overflow-x-auto rounded-lg bg-gray-950 p-3 text-xs"
                    {...props}
                  >
                    {children}
                  </pre>
                ),
                code: ({ className, children, ...props }) => {
                  const isBlock = className?.includes("language-");
                  if (isBlock) {
                    return (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    );
                  }
                  return (
                    <code
                      className="rounded bg-gray-700 px-1 py-0.5 text-xs"
                      {...props}
                    >
                      {children}
                    </code>
                  );
                },
              }}
            >
              {message.content}
            </Markdown>
          </div>
        )}
      </div>
    </div>
  );
}

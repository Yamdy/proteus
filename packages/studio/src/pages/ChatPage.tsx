import SessionSidebar from "../components/chat/SessionSidebar";
import ChatArea from "../components/chat/ChatArea";

export default function ChatPage() {
  return (
    <div className="flex h-full">
      <SessionSidebar />
      <div className="flex-1">
        <ChatArea />
      </div>
    </div>
  );
}

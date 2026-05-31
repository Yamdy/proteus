import { useState } from "react";
import SessionSidebar from "../components/chat/SessionSidebar";
import ChatArea from "../components/chat/ChatArea";
import InfoPanel from "../components/chat/InfoPanel";

export default function ChatPage() {
  const [showInfo, setShowInfo] = useState(true);

  return (
    <div className="flex h-full">
      <SessionSidebar />
      <div className="flex-1 min-w-0">
        <ChatArea onToggleInfo={() => setShowInfo((v) => !v)} showInfo={showInfo} />
      </div>
      {showInfo && <InfoPanel />}
    </div>
  );
}

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { PaperAirplaneIcon, ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';
import { sendChatMessage, loadConversation, checkHealth, type Message, type StreamChunk } from '../lib/api';

interface ChatMessage extends Message {
  id: string;
  streaming?: boolean;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isHealthy, setIsHealthy] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Check API health on mount
  useEffect(() => {
    checkHealth().then(setIsHealthy).catch(() => setIsHealthy(false));
  }, []);

  // Load conversation from localStorage on mount
  useEffect(() => {
    const savedConversationId = localStorage.getItem('conversationId');
    if (savedConversationId) {
      setConversationId(savedConversationId);
      loadConversation(savedConversationId).then(conversation => {
        if (conversation?.messages) {
          const chatMessages: ChatMessage[] = conversation.messages.map((msg, index) => ({
            ...msg,
            id: `${savedConversationId}-${index}`,
          }));
          setMessages(chatMessages);
        }
      }).catch(console.error);
    }
  }, []);

  // Save conversation ID to localStorage
  useEffect(() => {
    if (conversationId) {
      localStorage.setItem('conversationId', conversationId);
    }
  }, [conversationId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!input.trim() || isLoading) return;
    
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      ts: new Date().toISOString(),
    };

    setInput('');
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setError(null);

    // Create streaming assistant message placeholder
    const assistantMessageId = `assistant-${Date.now()}`;
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      ts: new Date().toISOString(),
      streaming: true,
    };
    
    setMessages(prev => [...prev, assistantMessage]);

    try {
      const response = await sendChatMessage(
        {
          conversationId: conversationId || undefined,
          message: userMessage.content,
          stream: true,
        },
        (chunk: StreamChunk) => {
          // Handle streaming chunks
          if (chunk.type === 'token' && chunk.data?.content) {
            setMessages(prev => prev.map(msg => 
              msg.id === assistantMessageId 
                ? { ...msg, content: msg.content + chunk.data.content }
                : msg
            ));
          }
          
          if (chunk.type === 'tool') {
            // Could show tool execution indicator here
            console.log('Tool executed:', chunk.data);
          }
          
          if (chunk.type === 'error') {
            setError(chunk.data?.message || 'Streaming error occurred');
            setMessages(prev => prev.map(msg => 
              msg.id === assistantMessageId 
                ? { ...msg, streaming: false, content: msg.content || 'Sorry, I encountered an error while processing your message.' }
                : msg
            ));
          }
        }
      );

      // Handle final response
      if (response.success && response.data) {
        // Update conversation ID if this was the first message
        if (!conversationId && response.data.conversationId) {
          setConversationId(response.data.conversationId);
        }

        // Mark streaming as complete
        setMessages(prev => prev.map(msg => 
          msg.id === assistantMessageId 
            ? { ...msg, streaming: false, content: response.data?.message || msg.content }
            : msg
        ));
      } else {
        setError(response.error?.message || 'Failed to send message');
        setMessages(prev => prev.map(msg => 
          msg.id === assistantMessageId 
            ? { ...msg, streaming: false, content: 'Sorry, I encountered an error. Please try again.' }
            : msg
        ));
      }
    } catch (error) {
      console.error('Chat error:', error);
      setError('Failed to send message');
      setMessages(prev => prev.map(msg => 
        msg.id === assistantMessageId 
          ? { ...msg, streaming: false, content: 'Sorry, I encountered an error. Please try again.' }
          : msg
      ));
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const startNewConversation = () => {
    setMessages([]);
    setConversationId(null);
    localStorage.removeItem('conversationId');
    setError(null);
    inputRef.current?.focus();
  };

  const formatMessageContent = (content: string) => {
    // Simple formatting for property data and line breaks
    return content
      .split('\n')
      .map((line, index) => (
        <span key={index}>
          {line}
          {index < content.split('\n').length - 1 && <br />}
        </span>
      ));
  };

  const renderMessage = (message: ChatMessage) => {
    const messageClass = `message-${message.role}`;
    
    return (
      <div
        key={message.id}
        className={`mb-4 flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} animate-slide-up`}
      >
        <div className={messageClass}>
          <div className="text-sm">
            {formatMessageContent(message.content)}
            {message.streaming && (
              <span className="inline-flex ml-1">
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <ChatBubbleLeftRightIcon className="h-8 w-8 text-primary-500" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">Property Chat</h1>
              <p className="text-sm text-gray-600">Nigerian Property Search Assistant</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Health indicator */}
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${
                isHealthy === null ? 'bg-gray-400' : 
                isHealthy ? 'bg-success-500' : 'bg-error-500'
              }`} />
              <span className="text-sm text-gray-600">
                {isHealthy === null ? 'Checking...' : isHealthy ? 'Online' : 'Offline'}
              </span>
            </div>
            
            {/* New chat button */}
            <button
              onClick={startNewConversation}
              className="btn-secondary text-sm"
              disabled={isLoading}
            >
              New Chat
            </button>
          </div>
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div className="bg-error-50 border border-error-200 px-4 py-3 mx-4 mt-4 rounded-lg">
          <div className="flex items-center">
            <div className="text-error-600 text-sm">
              <strong>Error:</strong> {error}
            </div>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-error-500 hover:text-error-700"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Chat messages */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6">
        <div className="space-y-4">
          {messages.length === 0 ? (
            <div className="text-center py-12 animate-fade-in">
              <ChatBubbleLeftRightIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                Welcome to Property Chat!
              </h2>
              <p className="text-gray-600 max-w-md mx-auto mb-6">
                I'm your Nigerian property search assistant. Ask me to help you find properties 
                in cities like Lagos, Abuja, Ibadan, and more!
              </p>
              <div className="text-sm text-gray-500 space-y-1">
                <p>Try asking:</p>
                <div className="space-y-1 mt-2">
                  <p className="font-mono bg-gray-100 px-2 py-1 rounded">"Show me 3-bedroom properties in Lagos"</p>
                  <p className="font-mono bg-gray-100 px-2 py-1 rounded">"Find apartments in Abuja under ₦2 million"</p>
                  <p className="font-mono bg-gray-100 px-2 py-1 rounded">"What properties are available in Victoria Island?"</p>
                </div>
              </div>
            </div>
          ) : (
            messages.map(renderMessage)
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input form */}
      <footer className="bg-white border-t border-gray-200 p-4">
        <div className="max-w-4xl mx-auto">
          <form onSubmit={handleSubmit} className="flex space-x-4">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about properties in Nigeria..."
              className="input-field flex-1"
              disabled={isLoading || isHealthy === false}
              maxLength={4000}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim() || isHealthy === false}
              className="btn-primary flex items-center space-x-2"
            >
              <PaperAirplaneIcon className="h-5 w-5" />
              <span className="hidden sm:inline">
                {isLoading ? 'Sending...' : 'Send'}
              </span>
            </button>
          </form>
          
          <div className="mt-2 text-xs text-gray-500 text-center">
            {conversationId && (
              <span>Conversation ID: {conversationId.slice(0, 8)}...</span>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

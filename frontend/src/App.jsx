import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import FileUploader from './components/FileUploader';
import DebateArena from './components/DebateArena';
import api from './services/api';

const App = () => {
  const [file, setFile] = useState(null);
  const [topic, setTopic] = useState('');
  const [transcript, setTranscript] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDebating, setIsDebating] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState('');
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const socketIdRef = useRef('');
  const socketRef = useRef(null);
  const isDebatingRef = useRef(false);

  // Keep a mutable ref in sync with React state so socket listeners (registered once)
  // can always read the latest debating status without stale closure issues.
  useEffect(() => {
    isDebatingRef.current = isDebating;
  }, [isDebating]);

  // Build a browser object URL for the currently selected PDF.
  // Why we do this:
  // 1) <object>/<iframe> needs a URL-like source, not a raw File object.
  // 2) URL.createObjectURL allocates browser memory for that file blob.
  // 3) URL.revokeObjectURL in cleanup releases that memory when file changes
  //    or when the component unmounts, preventing memory leaks over time.
  useEffect(() => {
    if (!file) {
      setPdfPreviewUrl('');
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setPdfPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  useEffect(() => {
    const socket = io('http://localhost:5000', {
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socketIdRef.current = socket.id;
      setIsSocketConnected(true);
    });

    socket.on('debate_turn', (message) => {
      if (!isDebatingRef.current) return;
      setTranscript((prev) => [...prev, message]);
    });

    socket.on('debate_complete', () => {
      setIsLoading(false);
    });

    socket.on('debate_stopped', () => {
      setIsLoading(false);
    });

    socket.on('debate_error', (payload) => {
      setIsLoading(false);
      window.alert(payload?.message || 'Debate failed.');
    });

    socket.on('disconnect', () => {
      socketIdRef.current = '';
      setIsSocketConnected(false);
    });

    return () => {
      socketRef.current = null;
      socket.disconnect();
    };
  }, []);

  const startDebate = async (event) => {
    event.preventDefault();

    if (!file || !topic.trim()) {
      window.alert('Please upload a PDF and enter a debate topic first.');
      return;
    }

    try {
      if (!socketIdRef.current) {
        window.alert('Socket is not connected yet. Please wait a moment and try again.');
        return;
      }

      setIsLoading(true);
      setTranscript([]);

      const formData = new FormData();
      formData.append('document', file);
      formData.append('topic', topic.trim());
      formData.append('socketId', socketIdRef.current);

      await api.post('/debate', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      // API accepted the debate job, so switch left panel from uploader to live PDF preview.
      setIsDebating(true);
      isDebatingRef.current = true;
    } catch (error) {
      console.error('[App:startDebate] Failed to start debate:', error);
      window.alert(error?.response?.data?.message || 'Failed to start debate. Please try again.');
      setIsLoading(false);
    } finally {
      // Loading ends when debate_complete/debate_error arrives over socket.
    }
  };

  const stopDebate = () => {
    if (!socketRef.current || !socketIdRef.current) {
      return;
    }

    // Stop request is sent over the active socket so the backend can mark
    // this socket's current debate run as cancelled and exit its debate loop.
    socketRef.current.emit('stop_debate', { socketId: socketIdRef.current });
  };

  const startOver = () => {
    if (isLoading) {
      stopDebate();
    }

    // Reset all debate/input state so the upload workflow is shown again from a clean slate.
    setIsDebating(false);
    isDebatingRef.current = false;
    setIsLoading(false);
    setTranscript([]);
    setFile(null);
    setTopic('');
  };

  return (
    <main className="h-screen w-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-slate-100">
      <div className="grid h-full w-full grid-cols-1 md:grid-cols-2">
        <section className="flex h-full border-b border-slate-800 p-6 md:border-b-0 md:border-r">
          <div className="flex h-full w-full max-w-xl flex-col">
            {isDebating ? (
              <div className="flex h-full flex-col rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4 shadow-2xl backdrop-blur-sm">
                <button
                  type="button"
                  onClick={startOver}
                  className="self-start rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:border-cyan-400 hover:text-cyan-200"
                >
                  Upload New Document
                </button>

                <div className="mt-4 flex-1 overflow-hidden rounded-xl border border-slate-700 bg-slate-950/70">
                  {/* The object tag renders the selected PDF inside the panel.
                      We feed it the generated blob URL so no backend URL is needed.
                      This consumes the full available height to maximize left-panel utility. */}
                  {pdfPreviewUrl ? (
                    <object data={pdfPreviewUrl} type="application/pdf" className="h-full w-full">
                      <div className="flex h-full items-center justify-center p-4 text-center text-sm text-slate-300">
                        PDF preview unavailable in this browser. Please download and open locally.
                      </div>
                    </object>
                  ) : (
                    <div className="flex h-full items-center justify-center p-4 text-center text-sm text-slate-300">
                      Preparing PDF preview...
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <form className="w-full" onSubmit={startDebate}>
                <FileUploader
                  onFileSelect={setFile}
                  onTopicChange={setTopic}
                  topic={topic}
                  selectedFile={file}
                />

                <button
                  type="submit"
                  disabled={isLoading}
                  className="mt-5 w-full rounded-lg bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoading ? 'Launching Debate...' : 'Start Debate'}
                </button>
              </form>
            )}
          </div>
        </section>

        <section className="relative flex flex-col p-6">
          <DebateArena
            transcript={transcript}
            isLoading={isLoading}
            isSocketConnected={isSocketConnected}
            canStopDebate={isLoading}
            onStopDebate={stopDebate}
          />
        </section>
      </div>
    </main>
  );
};

export default App;

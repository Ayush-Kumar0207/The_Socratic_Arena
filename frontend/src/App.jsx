import { useState } from 'react';
import FileUploader from './components/FileUploader';
import DebateArena from './components/DebateArena';
import api from './services/api';

const App = () => {
  const [file, setFile] = useState(null);
  const [topic, setTopic] = useState('');
  const [transcript, setTranscript] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const startDebate = async (event) => {
    event.preventDefault();

    if (!file || !topic.trim()) {
      window.alert('Please upload a PDF and enter a debate topic first.');
      return;
    }

    try {
      setIsLoading(true);
      setTranscript([]);

      const formData = new FormData();
      formData.append('document', file);
      formData.append('topic', topic.trim());

      const { data } = await api.post('/debate', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setTranscript(Array.isArray(data?.transcript) ? data.transcript : []);
    } catch (error) {
      console.error('[App:startDebate] Failed to start debate:', error);
      window.alert(error?.response?.data?.message || 'Failed to start debate. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="h-screen w-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-slate-100">
      <div className="grid h-full w-full grid-cols-1 md:grid-cols-2">
        <section className="flex items-center justify-center border-b border-slate-800 p-6 md:border-b-0 md:border-r">
          <form className="w-full max-w-xl" onSubmit={startDebate}>
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
        </section>

        <section className="relative flex flex-col p-6">
          <DebateArena transcript={transcript} isLoading={isLoading} />
        </section>
      </div>
    </main>
  );
};

export default App;

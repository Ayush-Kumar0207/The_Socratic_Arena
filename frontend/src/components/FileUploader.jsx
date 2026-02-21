import { UploadCloud, FileText } from 'lucide-react';

/**
 * FileUploader
 * -----------------------------------------------------------------------------
 * Left-side upload card for The Socratic Arena.
 * - Lets user choose a PDF document.
 * - Lets user define debate topic.
 * - Delegates state ownership to parent via callback props.
 */
const FileUploader = ({ onFileSelect, onTopicChange, topic = '', selectedFile = null }) => {
  return (
    <div className="w-full max-w-xl rounded-2xl border border-slate-700/80 bg-slate-900/70 p-6 shadow-2xl backdrop-blur-sm">
      <div className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight text-slate-100">Prepare the Arena</h2>
        <p className="mt-2 text-sm text-slate-400">
          Upload your document and define the debate topic for the Critic vs Defender showdown.
        </p>
      </div>

      <label className="group relative mb-5 block cursor-pointer rounded-xl border-2 border-dashed border-slate-600 bg-slate-800/70 p-8 text-center transition hover:border-cyan-400/70 hover:bg-slate-800">
        <input
          type="file"
          accept="application/pdf"
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          onChange={(event) => onFileSelect?.(event.target.files?.[0] || null)}
        />

        <UploadCloud className="mx-auto mb-3 h-10 w-10 text-cyan-300 transition group-hover:scale-105 group-hover:text-cyan-200" />

        <p className="text-sm font-medium text-slate-200">Drag & drop a PDF here, or click to browse</p>
        <p className="mt-1 text-xs text-slate-400">Accepted format: .pdf</p>
      </label>

      <div className="mb-6 rounded-lg border border-slate-700 bg-slate-800/70 p-3">
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <FileText className="h-4 w-4 text-violet-300" />
          <span className="truncate">
            {selectedFile?.name ? `Selected: ${selectedFile.name}` : 'No file selected yet'}
          </span>
        </div>
      </div>

      <div>
        <label htmlFor="topic" className="mb-2 block text-sm font-semibold text-slate-200">
          Debate Topic
        </label>
        <input
          id="topic"
          type="text"
          value={topic}
          onChange={(event) => onTopicChange?.(event.target.value)}
          placeholder="e.g., Is the proposed policy ethically justified?"
          className="w-full rounded-lg border border-slate-600 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 outline-none ring-cyan-400/70 transition focus:border-cyan-400 focus:ring-2"
        />
      </div>
    </div>
  );
};

export default FileUploader;

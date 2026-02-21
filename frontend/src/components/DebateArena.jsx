import { useEffect, useRef, useState } from 'react';
import { Shield, Swords, Bot, Download, Square } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';

/**
 * DebateArena
 * -----------------------------------------------------------------------------
 * Renders the right-side live debate transcript UI.
 *
 * Props:
 * - transcript: Array of messages like { speaker: 'Critic' | 'Defender', text: '...' }
 * - isLoading: boolean indicating if backend is still generating debate turns.
 * - isSocketConnected: boolean indicating websocket connection health.
 *
 * UX behavior:
 * - Distinct visual styling for Critic vs Defender for quick readability.
 * - Empty state when no debate transcript exists yet.
 * - Auto-scroll to latest message whenever transcript updates.
 */
const DebateArena = ({
  transcript = [],
  isLoading = false,
  isSocketConnected = false,
  canStopDebate = false,
  onStopDebate = null,
}) => {
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  // Stores a DOM reference to a tiny "anchor" div rendered after the last message.
  // Instead of calculating scroll heights manually, we can always ask the browser
  // to bring this anchor into view, which naturally lands the viewport at the bottom.
  const endOfMessagesRef = useRef(null);
  const transcriptCaptureRef = useRef(null);

  // Whenever the transcript array changes (new streamed turn appended),
  // smoothly scroll to the bottom anchor so the newest content is visible.
  // Optional chaining avoids crashes during the first render before the ref is mounted.
  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  const buildTranscriptText = () => {
    if (!transcript.length) return 'No transcript available.';

    return transcript
      .map((turn, index) => {
        const speaker = turn?.speaker || 'System';
        const text = (turn?.text || '').trim();
        return `Turn ${index + 1}\n${speaker}:\n${text}\n`;
      })
      .join('\n');
  };

  const downloadTxt = () => {
    const content = buildTranscriptText();

    // Blob converts plain text into a downloadable file-like object in memory.
    // We then generate a temporary object URL and click a temporary <a> element
    // so the browser downloads it as a .txt file without server involvement.
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `debate-transcript-${Date.now()}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const downloadPdf = async () => {
    if (!transcriptCaptureRef.current || transcript.length === 0) {
      window.alert('No transcript content is available to export yet.');
      return;
    }

    try {
      setIsExportingPdf(true);

      // html-to-image captures the full node and avoids html2canvas parsing issues
      // with modern CSS color functions (for example Tailwind's oklch colors).
      const imageData = await toPng(transcriptCaptureRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#0f172a',
      });

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgProps = pdf.getImageProperties(imageData);
      const imgHeight = (imgProps.height * imgWidth) / imgProps.width;

      // Multi-page logic:
      // 1) Place the full canvas image at y=0 on page 1.
      // 2) If image is taller than one page, add pages and keep shifting the same image upward.
      // This preserves layout fidelity exactly as rendered in the UI.
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imageData, 'PNG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imageData, 'PNG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
        heightLeft -= pageHeight;
      }

      pdf.save(`debate-transcript-${Date.now()}.pdf`);
    } catch (error) {
      console.error('[DebateArena:downloadPdf] Failed to export PDF:', error);
      window.alert('Failed to export PDF. Please try again.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Helper to normalize unknown speakers into a neutral style.
  const getSpeakerTheme = (speaker) => {
    if (speaker === 'Critic') {
      return {
        label: 'Critic',
        icon: <Swords className="h-4 w-4 text-rose-300" />,
        bubble: 'border-rose-500/40 bg-rose-950/30',
        name: 'text-rose-300',
      };
    }

    if (speaker === 'Defender') {
      return {
        label: 'Defender',
        icon: <Shield className="h-4 w-4 text-indigo-300" />,
        bubble: 'border-indigo-500/40 bg-indigo-950/30',
        name: 'text-indigo-300',
      };
    }

    return {
      label: speaker || 'System',
      icon: <Bot className="h-4 w-4 text-slate-300" />,
      bubble: 'border-slate-500/30 bg-slate-800/40',
      name: 'text-slate-300',
    };
  };

  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-700 bg-slate-900/60 p-5 shadow-inner">
      <div className="mb-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-bold text-slate-100">Debate Arena</h2>
          <span
            className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
              isSocketConnected
                ? 'border border-emerald-500/40 bg-emerald-900/30 text-emerald-300'
                : 'border border-amber-500/40 bg-amber-900/30 text-amber-300'
            }`}
          >
            {isSocketConnected ? 'Socket Connected' : 'Socket Reconnecting'}
          </span>
        </div>
        <p className="text-sm text-slate-400">Live Critic vs Defender transcript appears below.</p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={downloadTxt}
          disabled={transcript.length === 0}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800/80 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:border-cyan-400 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          Download .TXT
        </button>
        <button
          type="button"
          onClick={downloadPdf}
          disabled={transcript.length === 0 || isExportingPdf}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800/80 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:border-cyan-400 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          {isExportingPdf ? 'Preparing PDF...' : 'Download PDF'}
        </button>
        {canStopDebate && (
          <button
            type="button"
            onClick={() => onStopDebate?.()}
            className="inline-flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-rose-200 transition hover:border-rose-400 hover:text-rose-100"
          >
            <Square className="h-3.5 w-3.5" />
            Stop Debate
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto pr-1">
        <div ref={transcriptCaptureRef}>
          {transcript.length === 0 && !isLoading ? (
            <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-900/40 px-6 py-12 text-center">
              <Bot className="mb-3 h-9 w-9 text-slate-500" />
              <p className="text-sm text-slate-400">Upload a document to begin the debate...</p>
            </div>
          ) : (
            <div className="space-y-3">
              {transcript.map((message, index) => {
                const theme = getSpeakerTheme(message.speaker);

                return (
                  <article
                    key={`${message.speaker}-${index}`}
                    className={`rounded-xl border p-4 backdrop-blur-sm ${theme.bubble}`}
                  >
                    <header className="mb-2 flex items-center gap-2">
                      {theme.icon}
                      <span className={`text-xs font-semibold uppercase tracking-wide ${theme.name}`}>
                        {theme.label}
                      </span>
                    </header>

                    {/* Render model output as markdown so headings, bold text, tables,
                        checklists, and bullet/numbered lists all appear as intended. */}
                    {/* `remarkGfm` enables GitHub Flavored Markdown extensions such as
                        tables, strikethrough, and task lists that standard markdown omits. */}
                    <div className="prose prose-invert prose-sm max-w-none text-slate-100 prose-headings:my-2 prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0 prose-table:my-3 prose-th:text-slate-200 prose-td:text-slate-200">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {message.text ?? ''}
                      </ReactMarkdown>
                    </div>
                  </article>
                );
              })}

              {isLoading && (
                <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-4">
                  <p className="animate-pulse text-sm font-medium text-cyan-200">
                    AI is analyzing and debating...
                  </p>
                </div>
              )}

              {/* Invisible bottom marker used by scrollIntoView to auto-follow the stream. */}
              <div ref={endOfMessagesRef} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DebateArena;

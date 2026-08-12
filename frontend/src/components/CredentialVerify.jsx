import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { BadgeCheck, CircleAlert, Loader2, ShieldCheck } from "lucide-react";
import api from "../services/api";

const CredentialVerify = () => {
  const { code } = useParams();
  const [state, setState] = useState({
    loading: true,
    result: null,
    error: "",
  });

  useEffect(() => {
    let active = true;
    api
      .get(`/product/credentials/verify/${encodeURIComponent(code)}`)
      .then((response) => {
        if (active)
          setState({ loading: false, result: response.data, error: "" });
      })
      .catch((error) => {
        if (active)
          setState({
            loading: false,
            result: null,
            error:
              error.response?.data?.message ||
              "Credential could not be verified.",
          });
      });
    return () => {
      active = false;
    };
  }, [code]);

  if (state.loading)
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950">
        <Loader2 className="h-9 w-9 animate-spin text-cyan-400" />
      </main>
    );

  const credential = state.result?.credential;
  const valid = Boolean(state.result?.valid);
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-5 text-slate-100">
      <section className="w-full max-w-2xl rounded-3xl border border-slate-800 bg-slate-900/80 p-7 shadow-2xl sm:p-10">
        <div className="flex items-start gap-4">
          <div
            className={`rounded-2xl p-3 ${valid ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300"}`}
          >
            {valid ? (
              <BadgeCheck className="h-8 w-8" />
            ) : (
              <CircleAlert className="h-8 w-8" />
            )}
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-400">
              Socratic Arena credential registry
            </p>
            <h1 className="mt-2 text-3xl font-black">
              {valid ? "Verified credential" : "Credential not valid"}
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              {state.error ||
                (valid
                  ? "The signature and current credential status were verified by the issuer."
                  : "This credential is expired, revoked, unsigned, or does not exist.")}
            </p>
          </div>
        </div>
        {credential && (
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {[
              ["Recipient", credential.username],
              ["Credential", credential.title],
              ["Level", credential.level],
              ["Issued", new Date(credential.issued_at).toLocaleDateString()],
              ["Verification code", credential.verification_code],
              [
                "Cryptographic signature",
                state.result.signature_verified ? "Verified" : "Not verified",
              ],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-slate-950/70 p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                  {label}
                </div>
                <div className="mt-1 break-words text-sm font-bold text-slate-200">
                  {value || "—"}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-7 flex items-center gap-2 text-xs text-slate-500">
          <ShieldCheck className="h-4 w-4 text-cyan-500" /> Verification exposes
          no email address or private account data.
        </div>
      </section>
    </main>
  );
};

export default CredentialVerify;

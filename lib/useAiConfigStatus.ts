"use client";

import { useEffect, useState } from "react";

// Shared by Settings and the Navbar's session pill so both surfaces agree on
// whether a server-side Groq/PSI key is configured, without each re-deriving
// its own copy of this one GET request.
export function useAiConfigStatus() {
  const [psiConfigured, setPsiConfigured] = useState<boolean | null>(null);
  const [groqConfigured, setGroqConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/ai")
      .then((r) => r.json())
      .then((d) => {
        setPsiConfigured(Boolean(d.psiConfigured));
        setGroqConfigured(Boolean(d.groqConfigured));
      })
      .catch(() => {
        setPsiConfigured(false);
        setGroqConfigured(false);
      });
  }, []);

  return { psiConfigured, groqConfigured };
}

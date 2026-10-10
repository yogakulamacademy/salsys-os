'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Link2,
  RefreshCw,
} from 'lucide-react';

type FacebookLoginResponse = {
  authResponse?: {
    code?: string;
  } | null;
  status?: string;
};

type FacebookSdk = {
  init(options: {
    appId: string;
    autoLogAppEvents: boolean;
    xfbml: boolean;
    version: string;
  }): void;
  login(
    callback: (response: FacebookLoginResponse) => void,
    options: {
      config_id: string;
      response_type: 'code';
      override_default_response_type: true;
      extras: {
        setup: Record<string, never>;
      };
    },
  ): void;
};

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

type SessionInfo = {
  wabaId: string;
  phoneNumberId: string | null;
};

type StartResponse = {
  ok?: boolean;
  intent?: string;
  error?: string;
};

type CompleteResponse = {
  ok?: boolean;
  message?: string;
  error?: string;
};

type WhatsAppEmbeddedSignupButtonProps = {
  appId: string;
  configId: string;
  graphVersion: string;
  mode?: 'connect' | 'reconnect';
};

let sdkLoadPromise: Promise<void> | null = null;

function facebookOrigin(origin: string) {
  try {
    const url = new URL(origin);

    return (
      url.protocol === 'https:' &&
      (url.hostname === 'facebook.com' ||
        url.hostname.endsWith('.facebook.com'))
    );
  } catch {
    return false;
  }
}

function loadFacebookSdk({
  appId,
  graphVersion,
}: {
  appId: string;
  graphVersion: string;
}) {
  if (window.FB) {
    window.FB.init({
      appId,
      autoLogAppEvents: true,
      xfbml: true,
      version: graphVersion,
    });

    return Promise.resolve();
  }

  if (sdkLoadPromise) {
    return sdkLoadPromise;
  }

  sdkLoadPromise = new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error('Meta login SDK did not load.'));
    }, 15000);

    window.fbAsyncInit = () => {
      window.clearTimeout(timeout);

      if (!window.FB) {
        reject(new Error('Meta login SDK is unavailable.'));
        return;
      }

      window.FB.init({
        appId,
        autoLogAppEvents: true,
        xfbml: true,
        version: graphVersion,
      });

      resolve();
    };

    const existing = document.getElementById('facebook-jssdk');

    if (existing) {
      return;
    }

    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error('Unable to load Meta login SDK.'));
    };

    document.body.appendChild(script);
  }).finally(() => {
    if (!window.FB) {
      sdkLoadPromise = null;
    }
  });

  return sdkLoadPromise;
}

export function WhatsAppEmbeddedSignupButton({
  appId,
  configId,
  graphVersion,
  mode = 'connect',
}: WhatsAppEmbeddedSignupButtonProps) {
  const [sdkReady, setSdkReady] = useState(false);
  const [opening, setOpening] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const intentRef = useRef<string | null>(null);
  const codeRef = useRef<string | null>(null);
  const sessionRef = useRef<SessionInfo | null>(null);
  const cancelledRef = useRef(false);
  const completionStartedRef = useRef(false);
  const intentPromiseRef = useRef<Promise<string> | null>(null);

  const configured = Boolean(appId && configId);

  useEffect(() => {
    let active = true;

    if (!configured) {
      setSdkReady(false);
      return () => {
        active = false;
      };
    }

    loadFacebookSdk({ appId, graphVersion })
      .then(() => {
        if (active) {
          setSdkReady(true);
        }
      })
      .catch((loadError) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Unable to load Meta login.',
          );
        }
      });

    return () => {
      active = false;
    };
  }, [appId, configured, graphVersion]);

  const completeIfReady = useCallback(async () => {
    if (
      cancelledRef.current ||
      completionStartedRef.current ||
      !intentRef.current ||
      !codeRef.current ||
      !sessionRef.current?.wabaId
    ) {
      return;
    }

    completionStartedRef.current = true;
    setCompleting(true);
    setOpening(false);
    setError(null);

    try {
      const response = await fetch(
        '/api/integrations/whatsapp/embedded-signup/complete',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'same-origin',
          body: JSON.stringify({
            intent: intentRef.current,
            code: codeRef.current,
            waba_id: sessionRef.current.wabaId,
            phone_number_id:
              sessionRef.current.phoneNumberId,
          }),
        },
      );

      const payload = (await response.json()) as CompleteResponse;

      if (!response.ok || payload.ok !== true) {
        throw new Error(
          payload.error || 'Unable to connect WhatsApp Business.',
        );
      }

      const target = new URL(window.location.href);
      target.searchParams.delete('error');
      target.searchParams.set(
        'notice',
        payload.message || 'WhatsApp Business connected successfully.',
      );
      window.location.assign(target.toString());
    } catch (completeError) {
      completionStartedRef.current = false;
      setCompleting(false);
      setError(
        completeError instanceof Error
          ? completeError.message
          : 'Unable to connect WhatsApp Business.',
      );
    }
  }, []);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (!facebookOrigin(event.origin)) {
        return;
      }

      let data: unknown = event.data;

      if (typeof data === 'string') {
        try {
          data = JSON.parse(data) as unknown;
        } catch {
          return;
        }
      }

      if (!data || typeof data !== 'object') {
        return;
      }

      const record = data as Record<string, unknown>;

      if (record.type !== 'WA_EMBEDDED_SIGNUP') {
        return;
      }

      const eventName =
        typeof record.event === 'string' ? record.event : '';
      const eventData =
        record.data && typeof record.data === 'object'
          ? (record.data as Record<string, unknown>)
          : {};

      if (eventName === 'FINISH') {
        const wabaId =
          typeof eventData.waba_id === 'string'
            ? eventData.waba_id.trim()
            : '';
        const phoneNumberId =
          typeof eventData.phone_number_id === 'string'
            ? eventData.phone_number_id.trim()
            : null;

        if (!/^\d+$/.test(wabaId)) {
          setError(
            'Meta completed signup without returning a valid WhatsApp Business Account ID.',
          );
          setOpening(false);
          return;
        }

        sessionRef.current = {
          wabaId,
          phoneNumberId:
            phoneNumberId && /^\d+$/.test(phoneNumberId)
              ? phoneNumberId
              : null,
        };

        void completeIfReady();
        return;
      }

      if (eventName === 'ERROR') {
        cancelledRef.current = true;
        setOpening(false);
        setCompleting(false);
        setError(
          typeof eventData.error_message === 'string'
            ? eventData.error_message
            : 'Meta reported an error during WhatsApp Embedded Signup.',
        );
        return;
      }

      if (eventName === 'CANCEL') {
        cancelledRef.current = true;
        setOpening(false);
        setCompleting(false);
        setError('WhatsApp connection was cancelled.');
      }
    }

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [completeIfReady]);

  const startIntent = useCallback(async () => {
    const response = await fetch(
      '/api/integrations/whatsapp/embedded-signup/start',
      {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
        },
        body: '{}',
      },
    );

    const payload = (await response.json()) as StartResponse;

    if (!response.ok || payload.ok !== true || !payload.intent) {
      throw new Error(
        payload.error || 'Unable to start WhatsApp authorization.',
      );
    }

    return payload.intent;
  }, []);

  const launch = useCallback(() => {
    if (!window.FB || !sdkReady || !configured) {
      setError('Meta login is not ready yet. Please try again.');
      return;
    }

    intentRef.current = null;
    codeRef.current = null;
    sessionRef.current = null;
    cancelledRef.current = false;
    completionStartedRef.current = false;
    setError(null);
    setCompleting(false);
    setOpening(true);

    intentPromiseRef.current = startIntent();

    intentPromiseRef.current
      .then((intent) => {
        intentRef.current = intent;
        void completeIfReady();
      })
      .catch((intentError) => {
        cancelledRef.current = true;
        setOpening(false);
        setError(
          intentError instanceof Error
            ? intentError.message
            : 'Unable to start WhatsApp authorization.',
        );
      });

    window.FB.login(
      (response) => {
        const code = response.authResponse?.code?.trim() ?? '';

        if (!code) {
          cancelledRef.current = true;
          setOpening(false);
          setError('Meta login was cancelled or did not return an authorization code.');
          return;
        }

        codeRef.current = code;
        void completeIfReady();
      },
      {
        config_id: configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {},
        },
      },
    );
  }, [completeIfReady, configId, configured, sdkReady, startIntent]);

  const reconnect = mode === 'reconnect';
  const busy = opening || completing;

  return (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={launch}
        disabled={!configured || !sdkReady || busy}
        className={
          reconnect
            ? 'btn-secondary'
            : 'inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-violet-700 disabled:cursor-wait disabled:opacity-60'
        }
      >
        {reconnect ? (
          <RefreshCw size={14} />
        ) : (
          <Link2 size={14} />
        )}

        {completing
          ? 'Saving WhatsApp...'
          : opening
            ? 'Complete setup in Meta...'
            : !configured
              ? 'WhatsApp onboarding not configured'
              : reconnect
                ? 'Reconnect WhatsApp'
                : 'Continue with Meta'}
      </button>

      {error ? (
        <div className="max-w-sm text-[11px] leading-5 text-rose-600">
          {error}
        </div>
      ) : null}
    </div>
  );
}

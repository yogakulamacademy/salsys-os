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

type IntegrationConnectButtonProps = {
  provider: 'google' | 'meta' | 'instagram';
  mode?: 'connect' | 'reconnect';
};

const POPUP_WIDTH = 560;
const POPUP_HEIGHT = 720;

export function IntegrationConnectButton({
  provider,
  mode = 'connect',
}: IntegrationConnectButtonProps) {
  const [opening, setOpening] =
    useState(false);

  const popupRef =
    useRef<Window | null>(
      null,
    );

  const openPopup =
    useCallback(() => {
const left =
        Math.max(
          0,
          window.screenX +
            (window.outerWidth -
              POPUP_WIDTH) /
              2,
        );

      const top =
        Math.max(
          0,
          window.screenY +
            (window.outerHeight -
              POPUP_HEIGHT) /
              2,
        );

      const popup =
        window.open(
          `/api/integrations/${provider}/connect?popup=1`,
          `yogakulam-${provider}-oauth`,
          [
            `width=${POPUP_WIDTH}`,
            `height=${POPUP_HEIGHT}`,
            `left=${Math.round(left)}`,
            `top=${Math.round(top)}`,
            'resizable=yes',
            'scrollbars=yes',
          ].join(','),
        );

      if (!popup) {
        window.alert(
          'Your browser blocked the connection popup. Allow popups for this CRM and try again.',
        );
        return;
      }

      popupRef.current =
        popup;

      setOpening(true);

      popup.focus();
    }, [provider]);

  useEffect(() => {
    function handleMessage(
      event: MessageEvent,
    ) {
      if (
        event.origin !==
        window.location.origin
      ) {
        return;
      }

      if (
        !event.data ||
        event.data.type !==
          'yogakulam:integration-oauth'
      ) {
        return;
      }

      if (
        event.data.provider !==
        provider
      ) {
        return;
      }

      setOpening(false);

      popupRef.current =
        null;

      const target =
        new URL(
          window.location.href,
        );

      target.searchParams.delete(
        'notice',
      );

      target.searchParams.delete(
        'error',
      );

      if (
        event.data.ok === true
      ) {
        target.searchParams.set(
          'notice',
          event.data.message ||
            'Account connected successfully.',
        );
      } else {
        target.searchParams.set(
          'error',
          event.data.message ||
            'Account connection failed.',
        );
      }

      window.location.assign(
        target.toString(),
      );
    }

    window.addEventListener(
      'message',
      handleMessage,
    );

    return () => {
      window.removeEventListener(
        'message',
        handleMessage,
      );
    };
  }, [provider]);

  useEffect(() => {
    if (!opening) {
      return;
    }

    const interval =
      window.setInterval(
        () => {
          if (
            popupRef.current &&
            popupRef.current.closed
          ) {
            popupRef.current =
              null;

            setOpening(false);
          }
        },
        500,
      );

    return () => {
      window.clearInterval(
        interval,
      );
    };
  }, [opening]);

  const reconnect =
    mode === 'reconnect';

  const providerLabel =
    provider === 'google'
      ? 'Google'
      : provider === 'meta'
        ? 'Meta'
        : 'Instagram';

  return (
    <button
      type="button"
      onClick={
        openPopup
      }
      disabled={
        opening
      }
      className={
        reconnect
          ? 'btn-secondary'
          : 'inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-violet-700 disabled:cursor-wait disabled:opacity-60'
      }
    >
      {reconnect ? (
        <RefreshCw
          size={14}
        />
      ) : (
        <Link2
          size={14}
        />
      )}

      {opening
        ? `Opening ${providerLabel}...`
        : reconnect
          ? `Reconnect ${providerLabel}`
          : `Connect ${providerLabel}`}
    </button>
  );
}

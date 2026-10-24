'use client';

import { useEffect } from 'react';

const PENDING_LABEL = /\b(sending|saving|creating|verifying|connecting|inviting|publishing|syncing|processing|loading|updating|generating)\b/i;
const COPIED_LABEL = /\bcopied\b/i;
const ACTION_SELECTOR = 'button,[role="button"]';

function normalizedText(element: Element) {
  return (element.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function annotateAction(element: Element) {
  if (!(element instanceof HTMLElement)) return;

  const text = normalizedText(element);
  const disabled =
    element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true';
  const pending = disabled && PENDING_LABEL.test(text);
  const copied = COPIED_LABEL.test(text);

  if (pending) {
    if (element.getAttribute('aria-busy') !== 'true') {
      element.setAttribute('aria-busy', 'true');
      element.dataset.feedbackBusyManaged = 'true';
    }
    if (element.dataset.pending !== 'true') {
      element.dataset.pending = 'true';
      element.dataset.feedbackPendingManaged = 'true';
    }
  } else {
    if (element.dataset.feedbackBusyManaged === 'true') {
      element.removeAttribute('aria-busy');
      delete element.dataset.feedbackBusyManaged;
    }
    if (element.dataset.feedbackPendingManaged === 'true') {
      delete element.dataset.pending;
      delete element.dataset.feedbackPendingManaged;
    }
  }

  if (copied) {
    if (!element.dataset.copyState) {
      element.dataset.copyState = 'copied';
      element.dataset.feedbackCopyManaged = 'true';
    }
  } else if (element.dataset.feedbackCopyManaged === 'true') {
    delete element.dataset.copyState;
    delete element.dataset.feedbackCopyManaged;
  }
}

function annotateWithin(root: Node) {
  if (root instanceof Element && root.matches(ACTION_SELECTOR)) {
    annotateAction(root);
  }

  if (!(root instanceof Element || root instanceof Document || root instanceof DocumentFragment)) {
    return;
  }

  root.querySelectorAll(ACTION_SELECTOR).forEach(annotateAction);
}

export function InteractionFeedbackBridge() {
  useEffect(() => {
    const root = document.body;
    let frame = 0;

    const scan = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => annotateWithin(root));
    };

    annotateWithin(root);

    const observer = new MutationObserver(scan);
    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['disabled', 'aria-disabled'],
    });

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}

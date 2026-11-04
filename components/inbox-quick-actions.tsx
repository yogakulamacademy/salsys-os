"use client";

import Link from "next/link";
import { ArrowUpRight, CalendarClock, MoreHorizontal, Phone, UserRoundPlus } from "lucide-react";

export function InboxQuickActions({
  phone, canCall, canAssign, profileHref,
}:{
  phone?:string | null; canCall:boolean; canAssign:boolean; profileHref:string;
}) {
  const callNumber = phone?.replace(/[^\d+]/g, "") || "";
  const showAssignment = () => {
    const panel = document.getElementById("inbox-assignment");
    if (panel instanceof HTMLDetailsElement) {
      panel.open = true;
      panel.scrollIntoView({block:"nearest",behavior:"smooth"});
      panel.querySelector<HTMLElement>("select")?.focus();
    }
  };
  const showSchedule = () => {
    const panel = document.getElementById("inbox-next-steps");
    if (!panel) return;
    panel.querySelector<HTMLButtonElement>(".ibx-v2-link-action")?.click();
    panel.scrollIntoView({block:"nearest",behavior:"smooth"});
  };
  return (
    <section className="ibx-v2-quick-actions">
      <div className="ibx-v2-context-card-head"><MoreHorizontal size={17}/><h3>Quick actions</h3></div>
      <div className="ibx-v2-quick-grid">
        {canCall && callNumber ?
          <a href={`tel:${callNumber}`} className="ibx-v2-quick-tile" aria-label="Call customer">
            <Phone size={18}/><span>Call</span>
          </a> :
          <span className="ibx-v2-quick-tile ibx-v2-quick-disabled" title="Phone contact not available or not verified">
            <Phone size={18}/><span>Call</span>
          </span>
        }
        <button type="button" onClick={showSchedule} className="ibx-v2-quick-tile">
          <CalendarClock size={18}/><span>Schedule</span>
        </button>
        <button type="button" onClick={showAssignment} className="ibx-v2-quick-tile"
          disabled={!canAssign} title={canAssign?"Assign or reassign lead":"Assignment requires permission"}>
          <UserRoundPlus size={18}/><span>Assign</span>
        </button>
        <Link href={profileHref} className="ibx-v2-quick-tile">
          <ArrowUpRight size={18}/><span>Profile</span>
        </Link>
      </div>
    </section>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { ArrowRight, Filter, Search, UserPlus, UsersRound } from 'lucide-react';
import { setEmployeeActiveAction } from './actions';

export type DirectoryMember = {
  id: string;
  fullName: string | null;
  email: string;
  organizationRole: string;
  active: boolean;
};

type MemberStatusFilter = 'all' | 'active' | 'inactive';

function nameFor(member: DirectoryMember) {
  return member.fullName?.trim() || 'CRM User';
}
function initials(name: string) {
  const letters = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]);
  return letters.join('').toUpperCase() || 'U';
}
function roleLabel(role: string) {
  if (role === 'owner') return 'Owner';
  if (role === 'admin') return 'Admin';
  if (role === 'admissions') return 'Employee';
  return 'Restricted role';
}

export function TeamDirectory({ members, organizationName }: {
  members: DirectoryMember[];
  organizationName: string;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<MemberStatusFilter>('all');
  const activeCount = members.filter(member => member.active).length;
  const inactiveCount = members.length - activeCount;
  const employees = members.filter(member => member.organizationRole === 'admissions');
  const visible = useMemo(() => {
    const q = search.toLocaleLowerCase().trim();
    return members.filter(member => (filter === 'all' || (filter === 'active' ? member.active : !member.active))
      && (!q || nameFor(member).toLocaleLowerCase().includes(q) ||
        member.email.toLocaleLowerCase().includes(q) ||
        roleLabel(member.organizationRole).toLocaleLowerCase().includes(q)));
  }, [members, filter, search]);

  return <section className="tac-card tac-directory" aria-labelledby="tac-members-heading">
    <div className="tac-section-heading tac-directory-heading">
      <span className="tac-icon"><UsersRound size={20}/></span>
      <div className="tac-grow">
        <h2 id="tac-members-heading">Team Members</h2>
        <p>People with recorded access to {organizationName}.</p>
      </div>
      {members.length > 0 ? <div className="tac-search">
        <Search size={16} aria-hidden="true"/>
        <input type="search" value={search} onChange={event => setSearch(event.target.value)}
          placeholder="Search members..." aria-label="Search team members" maxLength={120}/>
      </div> : null}
    </div>

    {members.length > 0 ? <>
      <div className="tac-filter-row" role="group" aria-label="Team member status filters">
        {([
          { id:'all', label:'All', count:members.length },
          { id:'active', label:'Active', count:activeCount },
          { id:'inactive', label:'Inactive', count:inactiveCount },
        ] as const).map(option => <button type="button" key={option.id}
          onClick={() => setFilter(option.id)}
          className={filter === option.id ? 'tac-filter tac-filter-current' : 'tac-filter'}
          aria-pressed={filter === option.id}>
          {option.label} <span>({option.count})</span>
        </button>)}
      </div>
      {visible.length > 0 ? <div className="tac-table-scroll">
        <table className="tac-table">
          <thead><tr>
            <th scope="col">Member</th>
            <th scope="col">Role</th>
            <th scope="col">Status</th>
            <th scope="col" className="tac-access-heading">Access</th>
          </tr></thead>
          <tbody>{visible.map(member => {
            const isEmployee = member.organizationRole === 'admissions';
            const role = roleLabel(member.organizationRole);
            return <tr key={member.id}>
              <td><div className="tac-person">
                <span className="tac-avatar" aria-hidden="true">{initials(nameFor(member))}</span>
                <span className="tac-person-info"><strong>{nameFor(member)}</strong>
                  <small title={member.email}>{member.email || 'Email not available'}</small></span>
              </div></td>
              <td><span className={isEmployee ? 'tac-role tac-role-employee' : 'tac-role tac-role-admin'}>{role}</span></td>
              <td><span className={member.active ? 'tac-state tac-state-active' : 'tac-state tac-state-inactive'}>
                <span aria-hidden="true"/> {member.active ? 'Active' : 'Inactive'}</span></td>
              <td className="tac-access-cell">{isEmployee
                ? <form action={setEmployeeActiveAction}>
                    <input type="hidden" name="employee_id" value={member.id}/>
                    <input type="hidden" name="active" value={member.active ? 'false' : 'true'}/>
                    <button type="submit" className="tac-outline-action">
                      {member.active ? 'Deactivate' : 'Activate'}
                    </button>
                  </form>
                : <span className="tac-admin-access">Full tenant access</span>}</td>
            </tr>;
          })}</tbody>
        </table>
      </div> : <div className="tac-compact-empty" role="status">
        <Filter size={22} aria-hidden="true"/>
        <strong>No members match these filters</strong>
        <p>Try another name, email, role or status.</p>
        <button type="button" className="tac-outline-action" onClick={() => { setFilter('all'); setSearch(''); }}>Clear filters</button>
      </div>}
      {employees.length === 0 ? <div className="tac-onboarding-hint">
        <UserPlus size={18} aria-hidden="true"/>
        <span><strong>No employees yet.</strong> Your administrators are listed above. Add an employee to give them Sales workspace access.</span>
        <a href="#tac-create-member">Add employee <ArrowRight size={13}/></a>
      </div> : null}
    </> : <div className="tac-empty-team">
      <div className="tac-empty-illustration" aria-hidden="true"><UsersRound size={62}/><span><UserPlus size={22}/></span></div>
      <h3>No team members yet</h3>
      <p>Invite colleagues to collaborate securely. Team members appear here once they're assigned to this workspace.</p>
      <a className="tac-primary-action" href="#tac-create-member"><UserPlus size={16}/> Add Your First Team Member</a>
      <div className="tac-empty-benefits">
        <span>Secure collaboration</span><span>Role-based access</span><span>Tenant-scoped records</span>
      </div>
    </div>}
  </section>;
}

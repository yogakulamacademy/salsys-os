import fs from 'node:fs';
const migration=fs.readFileSync('supabase/migrations/20261102052954_internal_diagnostic_view_acl_hardening.sql','utf8');
const fixture=fs.readFileSync('tests/database/diagnostic-view-acl.fixture.sql','utf8');
if(!process.argv[2])throw Error('Provide an output path; execute only on the approved empty sandbox.');
fs.writeFileSync(process.argv[2],fixture.replace('-- __MIGRATION__',()=>migration));

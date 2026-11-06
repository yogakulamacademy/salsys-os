/**
 * KB-05F: fail-closed manual workflow attestation. PURE, no network or writes.
 *
 * These environment values must come from an independently reviewed GitHub
 * environment. Their consistency is a prerequisite, NOT cryptographic proof
 * that the GitHub environment is protected or that reviewers approved.
 */
export const ENVIRONMENT_READY_PHRASE='OWNER_APPROVED_KB_TEST_ENVIRONMENT';
const SHA40=/^[a-f0-9]{40}$/;
const PROJECT=/^[a-z0-9]{20}$/;
function deny(code){throw new Error('kb_staging_attestation_'+code);}
function read(env,key){
  const value=env?.[key];
  if(typeof value!=='string'||!value||value.length>200)deny('missing_'+key);
  return value;
}
function validRef(ref){
  return /^refs\/heads\/[A-Za-z0-9][A-Za-z0-9._/-]{0,120}$/.test(ref)&&
    !ref.includes('..')&&!ref.includes('//')&&!ref.includes('@{')&&
    !ref.endsWith('/')&&!ref.endsWith('.')&&!ref.includes('/.');
}

/**
 * Called from BOTH the workflow's early guard and the imported KB-05D runner.
 * GitHub environment protections and project ownership need external review.
 */
export function assessKbStagingWorkflowAttestation(env){
  if(read(env,'SALSYS_KB_STAGING_ENVIRONMENT_READY')!==ENVIRONMENT_READY_PHRASE)
    deny('environment_not_approved');
  const approved=read(env,'SALSYS_KB_STAGING_APPROVED_COMMIT');
  const actual=read(env,'SALSYS_KB_STAGING_CHECKOUT_SHA');
  const githubSha=read(env,'SALSYS_KB_STAGING_GITHUB_SHA');
  if(!SHA40.test(approved)||!SHA40.test(actual)||!SHA40.test(githubSha)||
    approved!==actual||actual!==githubSha)
    deny('unreviewed_commit');
  const expectedRef=read(env,'SALSYS_KB_STAGING_REVIEWED_REF');
  const actualRef=read(env,'SALSYS_KB_STAGING_GITHUB_REF');
  if(!validRef(expectedRef)||actualRef!==expectedRef)
    deny('unreviewed_git_ref');
  const expectedProject=read(env,'SALSYS_KB_STAGING_PROJECT_REF');
  const operatorProject=read(env,'OPERATOR_STAGING_PROJECT_REF');
  if(!PROJECT.test(expectedProject)||operatorProject!==expectedProject)
    deny('operator_project_mismatch');
  return Object.freeze({
    state:'consistent_claims_only',
    reviewedCodeCommitMatches:true,
    gitRefMatches:true,
    projectRefMatches:true,
    // These cannot be independently witnessed by a workflow assertion.
    protectedEnvironmentIndependentlyVerified:false,
    independentHumanApprovalIndependentlyVerified:false,
    actualStagingOwnershipVerified:false,
    grantsRuntimeOrProductionPermission:false,
  });
}

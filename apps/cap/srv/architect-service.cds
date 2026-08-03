using { sap.architect.builder as db } from '../db/schema';

/**
 * Primary backend service — SAP CAP (CAPM).
 * Bound on BTP with XSUAA; local mocked users in development.
 */
@path: 'architect'
service ArchitectService {

  /**
   * A job holds a customer's landscape — system names, trust boundaries, the drawing
   * itself. Exposed with only `authenticated-user` it was readable in bulk by anyone
   * with the lowest role: a single GET returned every architecture in the system.
   * Rows are owned by whoever ran the pipeline; an Auditor sees everything, and that
   * is a role you grant deliberately.
   */
  @readonly
  entity Jobs as projection on db.Jobs;

  @readonly
  entity ReferenceArchitectures as projection on db.ReferenceArchitectures;

  entity Feedback as projection on db.Feedback;

  /**
   * Run extract → retrieve → gaps → refine (LangGraph).
   * Returns status awaiting_review when HITL is enabled.
   */
  action runPipeline(
    hints       : String,
    fileName    : String,
    imageBase64 : LargeString,
    mimeType    : String,
    autoApprove : Boolean,
    provider    : String
  ) returns JobResult;

  /**
   * Architect approves/edits ArchitectureModel and resumes generation.
   */
  action approvePipeline(
    jobId     : String,
    modelJson : LargeString
  ) returns JobResult;

  /** Mock demo without an upload (same pipeline). */
  action runDemo(
    hints       : String,
    fileName    : String,
    autoApprove : Boolean,
    provider    : String
  ) returns JobResult;

  function getJob(jobId : String) returns JobResult;

  function health() returns HealthInfo;

  action seedCorpus(discover : Boolean) returns CorpusResult;

  type JobResult {
    jobId           : String;
    status          : String;
    engine          : String;
    title           : String;
    stepsJson       : LargeString;
    modelJson       : LargeString;
    extractedJson   : LargeString;
    refinedJson     : LargeString;
    approvedJson    : LargeString;
    referencesJson  : LargeString;
    gapsJson        : LargeString;
    resultJson      : LargeString;
    drawioXml       : LargeString;
    error           : String;
    createdAt       : String;
    updatedAt       : String;
  }

  type CorpusResult {
    count     : Integer;
    storeKind : String;
    idsJson   : LargeString;
  }

  type HealthInfo {
    ok                  : Boolean;
    backend             : String;
    service             : String;
    provider            : String;
    engine              : String;
    requireHumanReview  : Boolean;
    hasApiKey           : Boolean;
    vectorKind          : String;
    vectorCount         : Integer;
    providersJson       : LargeString;
  }
}

// Authenticated access; Architect role for write/pipeline actions
annotate ArchitectService with @(requires: 'authenticated-user');

annotate ArchitectService.runPipeline with @(requires: 'Architect');
annotate ArchitectService.approvePipeline with @(requires: 'Architect');
annotate ArchitectService.runDemo with @(requires: 'Architect');
annotate ArchitectService.seedCorpus with @(requires: 'Architect');
annotate ArchitectService.Feedback with @(restrict: [
  { grant: ['READ', 'WRITE'], to: 'Architect' },
  { grant: 'READ', to: 'Viewer' }
]);

// Row-level ownership. Without the `where`, any authenticated user could list every
// job in the tenant — every model, every diagram, every set of architect notes.
annotate ArchitectService.Jobs with @(restrict: [
  { grant: 'READ', to: 'Auditor' },
  { grant: 'READ', to: 'Architect', where: 'createdBy = $user' },
  { grant: 'READ', to: 'Viewer',    where: 'createdBy = $user' }
]);

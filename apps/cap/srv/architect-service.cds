using { sap.architect.builder as db } from '../db/schema';

/**
 * Primary backend service — SAP CAP (CAPM).
 * Bound on BTP with XSUAA; local mocked users in development.
 */
@path: 'architect'
service ArchitectService {

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
    autoApprove : Boolean
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
    autoApprove : Boolean
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

using { sap.architect.builder as db } from '../db/schema';

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
    hints      : String,
    fileName   : String,
    imageBase64: LargeString,
    mimeType   : String,
    autoApprove: Boolean
  ) returns JobResult;

  /**
   * Architect approves/edits ArchitectureModel and resumes generation.
   */
  action approvePipeline(
    jobId : String,
    modelJson : LargeString
  ) returns JobResult;

  action seedCorpus(discover : Boolean) returns CorpusResult;

  type JobResult {
    jobId     : String;
    status    : String;
    engine    : String;
    title     : String;
    stepsJson : LargeString;
    modelJson : LargeString;
    gapsJson  : LargeString;
    drawioXml : LargeString;
    error     : String;
  }

  type CorpusResult {
    count     : Integer;
    storeKind : String;
    idsJson   : LargeString;
  }
}

annotate ArchitectService with @(requires: 'authenticated-user');

annotate ArchitectService.runPipeline with @(requires: 'Architect');
annotate ArchitectService.approvePipeline with @(requires: 'Architect');
annotate ArchitectService.seedCorpus with @(requires: 'Architect');
annotate ArchitectService.Feedback with @(restrict: [
  { grant: ['READ', 'WRITE'], to: 'Architect' },
  { grant: 'READ', to: 'Viewer' }
]);

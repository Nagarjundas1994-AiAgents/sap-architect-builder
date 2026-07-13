namespace sap.architect.builder;

using { managed, cuid } from '@sap/cds/common';

/**
 * Persist pipeline jobs and approved architecture models for governance.
 */
entity Jobs : cuid, managed {
  externalId     : String(64);
  status         : String(32);
  engine         : String(32);
  title          : String(255);
  sourceFileName : String(255);
  hints          : LargeString;
  extractedJson  : LargeString;
  refinedJson    : LargeString;
  approvedJson   : LargeString;
  gapsJson       : LargeString;
  drawioXml      : LargeString;
  error          : LargeString;
}

entity ReferenceArchitectures : managed {
  key id       : String(64);
  title        : String(255);
  summary      : LargeString;
  tags         : LargeString;
  products     : LargeString;
  corpus       : LargeString;
  sourceUrl    : String(1024);
  source       : String(64);
}

entity Feedback : cuid, managed {
  job          : Association to Jobs;
  comment      : LargeString;
  rating       : Integer;
  corrections  : LargeString;
}

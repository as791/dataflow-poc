// Canonical catalog lives in @dataflow/shared — imported here so existing
// imports from '../catalog' keep working without changes.
export type { FieldSpec, CatalogEntry } from '@dataflow/shared';
export { CATALOG, catalogByType as byType } from '@dataflow/shared';

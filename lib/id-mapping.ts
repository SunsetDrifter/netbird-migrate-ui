// Manages source-to-destination ID remapping during migration

export class IdMapping {
  private groupMap: Map<string, string> = new Map();
  private postureCheckMap: Map<string, string> = new Map();

  addGroup(sourceId: string, destId: string) {
    this.groupMap.set(sourceId, destId);
  }

  addPostureCheck(sourceId: string, destId: string) {
    this.postureCheckMap.set(sourceId, destId);
  }

  mapGroupId(sourceId: string): string | undefined {
    return this.groupMap.get(sourceId);
  }

  mapGroupIds(sourceIds: string[]): string[] {
    return sourceIds
      .map((id) => this.groupMap.get(id))
      .filter((id): id is string => id !== undefined);
  }

  mapPostureCheckId(sourceId: string): string | undefined {
    return this.postureCheckMap.get(sourceId);
  }

  mapPostureCheckIds(sourceIds: string[]): string[] {
    return sourceIds
      .map((id) => this.postureCheckMap.get(id))
      .filter((id): id is string => id !== undefined);
  }

  hasGroup(sourceId: string): boolean {
    return this.groupMap.has(sourceId);
  }

  hasPostureCheck(sourceId: string): boolean {
    return this.postureCheckMap.has(sourceId);
  }
}

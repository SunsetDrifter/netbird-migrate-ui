import { NetBirdClient } from "./netbird-client";
import { IdMapping } from "./id-mapping";
import type {
  Group,
  PostureCheck,
  Policy,
  Route,
  DNSNameserverGroup,
  DNSZone,
  Network,
  ReverseProxyDomain,
  ReverseProxyService,
  Conflict,
  ResourceSelection,
  SourceResources,
  MigrationEvent,
  MigrationResult,
} from "./types";

type EventEmitter = (event: MigrationEvent) => void;

export class MigrationEngine {
  private source: NetBirdClient;
  private dest: NetBirdClient;
  private idMap: IdMapping;
  private emit: EventEmitter;
  private result: MigrationResult;

  constructor(
    source: NetBirdClient,
    dest: NetBirdClient,
    emit: EventEmitter
  ) {
    this.source = source;
    this.dest = dest;
    this.idMap = new IdMapping();
    this.emit = emit;
    this.result = { created: 0, skipped: 0, failed: 0, errors: [] };
  }

  async execute(
    resources: SourceResources,
    selection: ResourceSelection,
    conflicts: Conflict[]
  ): Promise<MigrationResult> {
    const conflictMap = new Map(
      conflicts.map((c) => [`${c.resourceType}:${c.sourceId}`, c])
    );

    // Fetch destination resources once for existing group mapping
    const destGroups = await this.dest.getGroups();
    const destGroupByName = new Map(
      destGroups.map((g) => [g.name.toLowerCase(), g])
    );

    // Pre-populate ID map with existing destination groups
    for (const srcGroup of resources.groups) {
      const existing = destGroupByName.get(srcGroup.name.toLowerCase());
      if (existing) {
        this.idMap.addGroup(srcGroup.id, existing.id);
      }
    }

    // Pre-populate posture check mapping for existing ones
    const destPostureChecks = await this.dest.getPostureChecks();
    const destPCByName = new Map(
      destPostureChecks.map((pc) => [pc.name.toLowerCase(), pc])
    );
    for (const srcPC of resources.posture_checks) {
      const existing = destPCByName.get(srcPC.name.toLowerCase());
      if (existing) {
        this.idMap.addPostureCheck(srcPC.id, existing.id);
      }
    }

    // Execute in dependency order
    await this.migrateGroups(resources.groups, selection.groups, conflictMap);
    await this.migratePostureChecks(
      resources.posture_checks,
      selection.posture_checks,
      conflictMap
    );
    await this.migratePolicies(resources.policies, selection.policies, conflictMap);
    await this.migrateRoutes(resources.routes, selection.routes, conflictMap);
    await this.migrateDNS(resources.dns, selection.dns, conflictMap);
    if (selection.dns_settings?.includes("disabled_management_groups")) {
      await this.migrateDNSSettings(resources);
    }
    await this.migrateDNSZones(
      resources.dns_zones || [],
      selection.dns_zones || [],
      conflictMap
    );
    await this.migrateNetworks(resources.networks, selection.networks, conflictMap);
    await this.migrateReverseProxyDomains(
      resources.reverse_proxy_domains || [],
      selection.reverse_proxy_domains || [],
      conflictMap
    );
    await this.migrateReverseProxyServices(
      resources.reverse_proxy_services || [],
      selection.reverse_proxy_services || [],
      conflictMap
    );
    await this.migrateAuthSettings(resources, selection.account_settings || []);

    this.emit({
      type: "complete",
      message: `Migration complete: ${this.result.created} created, ${this.result.skipped} skipped, ${this.result.failed} failed`,
      created: this.result.created,
      skipped: this.result.skipped,
      failed: this.result.failed,
    });

    return this.result;
  }

  private shouldSkip(
    resourceType: string,
    sourceId: string,
    conflictMap: Map<string, Conflict>
  ): { skip: boolean; overwrite: boolean; destId?: string } {
    const key = `${resourceType}:${sourceId}`;
    const conflict = conflictMap.get(key);
    if (!conflict) return { skip: false, overwrite: false };
    if (conflict.resolution === "skip") return { skip: true, overwrite: false };
    return { skip: false, overwrite: true, destId: conflict.destinationId };
  }

  private isAlreadyExistsError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return /already exist|already has|\(409\)/i.test(msg);
  }

  private async migrateGroups(
    groups: Group[],
    selectedIds: string[],
    conflictMap: Map<string, Conflict>
  ) {
    const selected = groups.filter(
      (g) => selectedIds.includes(g.id) && g.name.toLowerCase() !== "all"
    );

    for (const group of selected) {
      const { skip, overwrite, destId } = this.shouldSkip(
        "groups",
        group.id,
        conflictMap
      );

      if (skip) {
        this.result.skipped++;
        this.emit({
          type: "progress",
          resourceType: "groups",
          resourceName: group.name,
          message: `Skipped group: ${group.name}`,
        });
        continue;
      }

      try {
        if (overwrite && destId) {
          const updated = await this.dest.updateGroup(destId, {
            name: group.name,
            peers: [],
          });
          this.idMap.addGroup(group.id, updated.id);
          this.result.created++;
          this.emit({
            type: "success",
            resourceType: "groups",
            resourceName: group.name,
            message: `Updated group: ${group.name}`,
          });
        } else if (!this.idMap.hasGroup(group.id)) {
          const created = await this.dest.createGroup({
            name: group.name,
            peers: [],
          });
          this.idMap.addGroup(group.id, created.id);
          this.result.created++;
          this.emit({
            type: "success",
            resourceType: "groups",
            resourceName: group.name,
            message: `Created group: ${group.name}`,
          });
        } else {
          this.result.skipped++;
          this.emit({
            type: "progress",
            resourceType: "groups",
            resourceName: group.name,
            message: `Group already exists: ${group.name}`,
          });
        }
      } catch (err) {
        this.result.failed++;
        const errMsg = err instanceof Error ? err.message : String(err);
        this.result.errors.push({
          resourceType: "groups",
          name: group.name,
          error: errMsg,
        });
        this.emit({
          type: "error",
          resourceType: "groups",
          resourceName: group.name,
          message: `Failed to create group ${group.name}: ${errMsg}`,
        });
      }
    }
  }

  private async migratePostureChecks(
    checks: PostureCheck[],
    selectedIds: string[],
    conflictMap: Map<string, Conflict>
  ) {
    const selected = checks.filter((c) => selectedIds.includes(c.id));

    for (const check of selected) {
      const { skip, overwrite, destId } = this.shouldSkip(
        "posture_checks",
        check.id,
        conflictMap
      );

      if (skip) {
        this.result.skipped++;
        this.emit({
          type: "progress",
          resourceType: "posture_checks",
          resourceName: check.name,
          message: `Skipped posture check: ${check.name}`,
        });
        continue;
      }

      try {
        const data = {
          name: check.name,
          description: check.description,
          checks: check.checks,
        };

        if (overwrite && destId) {
          const updated = await this.dest.updatePostureCheck(destId, data);
          this.idMap.addPostureCheck(check.id, updated.id);
          this.result.created++;
          this.emit({
            type: "success",
            resourceType: "posture_checks",
            resourceName: check.name,
            message: `Updated posture check: ${check.name}`,
          });
        } else if (!this.idMap.hasPostureCheck(check.id)) {
          const created = await this.dest.createPostureCheck(data);
          this.idMap.addPostureCheck(check.id, created.id);
          this.result.created++;
          this.emit({
            type: "success",
            resourceType: "posture_checks",
            resourceName: check.name,
            message: `Created posture check: ${check.name}`,
          });
        } else {
          this.result.skipped++;
        }
      } catch (err) {
        this.result.failed++;
        const errMsg = err instanceof Error ? err.message : String(err);
        this.result.errors.push({
          resourceType: "posture_checks",
          name: check.name,
          error: errMsg,
        });
        this.emit({
          type: "error",
          resourceType: "posture_checks",
          resourceName: check.name,
          message: `Failed: ${check.name}: ${errMsg}`,
        });
      }
    }
  }

  private async migratePolicies(
    policies: Policy[],
    selectedIds: string[],
    conflictMap: Map<string, Conflict>
  ) {
    const selected = policies.filter((p) => selectedIds.includes(p.id));

    // Fetch destination policies for safety check
    const destPolicies = await this.dest.getPolicies();
    const destPolicyByName = new Map(
      destPolicies.map((p) => [p.name.toLowerCase(), p])
    );

    for (const policy of selected) {
      const { skip, overwrite, destId } = this.shouldSkip(
        "policies",
        policy.id,
        conflictMap
      );

      if (skip) {
        this.result.skipped++;
        this.emit({
          type: "progress",
          resourceType: "policies",
          resourceName: policy.name,
          message: `Skipped policy: ${policy.name}`,
        });
        continue;
      }

      // Safety check: skip if policy with same name already exists in destination
      if (!overwrite && destPolicyByName.has(policy.name.toLowerCase())) {
        this.result.skipped++;
        this.emit({
          type: "progress",
          resourceType: "policies",
          resourceName: policy.name,
          message: `Policy already exists in destination: ${policy.name}`,
        });
        continue;
      }

      try {
        const rules = policy.rules.map((rule) => {
          // Newer NetBird feature: rule destination can be a single network
          // resource. Policies are migrated before networks (we don't track
          // network-resource ID mappings), so the destination would be a
          // dangling source-side ID. Emit a clear warning so the operator
          // knows to recreate this rule manually.
          if (rule.destinationResource) {
            this.emit({
              type: "progress",
              resourceType: "policies",
              resourceName: policy.name,
              message: `Rule '${rule.name}' references a network resource (${rule.destinationResource.id}) as destination; not migrated. Recreate this rule manually after the network is migrated.`,
            });
          }
          return {
            name: rule.name,
            enabled: rule.enabled,
            action: rule.action,
            protocol: rule.protocol,
            bidirectional: rule.bidirectional,
            sources: this.idMap.mapGroupIds(
              (rule.sources ?? []).map((s) => s.id)
            ),
            destinations: this.idMap.mapGroupIds(
              (rule.destinations ?? []).map((d) => d.id)
            ),
            ports: rule.ports ?? [],
          };
        });

        // Skip policies whose every rule would end up with empty sources OR
        // empty destinations after ID mapping — NetBird rejects those.
        const hasUsableRule = rules.some(
          (r) => r.sources.length > 0 && r.destinations.length > 0
        );
        if (!hasUsableRule) {
          this.result.skipped++;
          this.emit({
            type: "progress",
            resourceType: "policies",
            resourceName: policy.name,
            message: `Skipped policy '${policy.name}': no rule has both sources and destinations after ID mapping (likely references a network resource or unmigrated group).`,
          });
          continue;
        }

        const postureChecks = policy.source_posture_checks
          ? this.idMap.mapPostureCheckIds(policy.source_posture_checks)
          : undefined;

        const data = {
          name: policy.name,
          description: policy.description,
          enabled: policy.enabled,
          rules,
          source_posture_checks: postureChecks,
        };

        if (overwrite && destId) {
          await this.dest.updatePolicy(destId, data);
        } else {
          await this.dest.createPolicy(data);
        }
        this.result.created++;
        this.emit({
          type: "success",
          resourceType: "policies",
          resourceName: policy.name,
          message: `${overwrite ? "Updated" : "Created"} policy: ${policy.name}`,
        });
      } catch (err) {
        this.result.failed++;
        const errMsg = err instanceof Error ? err.message : String(err);
        this.result.errors.push({
          resourceType: "policies",
          name: policy.name,
          error: errMsg,
        });
        this.emit({
          type: "error",
          resourceType: "policies",
          resourceName: policy.name,
          message: `Failed: ${policy.name}: ${errMsg}`,
        });
      }
    }
  }

  private async migrateRoutes(
    routes: Route[],
    selectedIds: string[],
    conflictMap: Map<string, Conflict>
  ) {
    const selected = routes.filter((r) => selectedIds.includes(r.id));

    for (const route of selected) {
      const displayName = route.name || route.network || route.network_id;
      const { skip, overwrite, destId } = this.shouldSkip(
        "routes",
        route.id,
        conflictMap
      );

      if (skip) {
        this.result.skipped++;
        this.emit({
          type: "progress",
          resourceType: "routes",
          resourceName: displayName,
          message: `Skipped route: ${displayName}`,
        });
        continue;
      }

      try {
        const data = {
          name: route.name,
          description: route.description,
          network_id: route.network_id,
          network: route.network,
          enabled: route.enabled,
          peer_groups: this.idMap.mapGroupIds(route.peer_groups || []),
          metric: route.metric,
          masquerade: route.masquerade,
          groups: this.idMap.mapGroupIds(route.groups || []),
          keep_route: route.keep_route,
          domains: route.domains,
        };

        if (overwrite && destId) {
          await this.dest.updateRoute(destId, data);
        } else {
          await this.dest.createRoute(data);
        }
        this.result.created++;
        this.emit({
          type: "success",
          resourceType: "routes",
          resourceName: displayName,
          message: `${overwrite ? "Updated" : "Created"} route: ${displayName}`,
        });
      } catch (err) {
        if (this.isAlreadyExistsError(err)) {
          this.result.skipped++;
          this.emit({
            type: "progress",
            resourceType: "routes",
            resourceName: displayName,
            message: `Already exists, skipped route: ${displayName}`,
          });
        } else {
          this.result.failed++;
          const errMsg = err instanceof Error ? err.message : String(err);
          this.result.errors.push({
            resourceType: "routes",
            name: displayName,
            error: errMsg,
          });
          this.emit({
            type: "error",
            resourceType: "routes",
            resourceName: displayName,
            message: `Failed: ${displayName}: ${errMsg}`,
          });
        }
      }
    }
  }

  private async migrateDNS(
    dnsGroups: DNSNameserverGroup[],
    selectedIds: string[],
    conflictMap: Map<string, Conflict>
  ) {
    const selected = dnsGroups.filter((d) => selectedIds.includes(d.id));

    for (const dns of selected) {
      const { skip, overwrite, destId } = this.shouldSkip(
        "dns",
        dns.id,
        conflictMap
      );

      if (skip) {
        this.result.skipped++;
        this.emit({
          type: "progress",
          resourceType: "dns",
          resourceName: dns.name,
          message: `Skipped DNS group: ${dns.name}`,
        });
        continue;
      }

      try {
        const data = {
          name: dns.name,
          description: dns.description,
          nameservers: dns.nameservers,
          enabled: dns.enabled,
          groups: this.idMap.mapGroupIds(dns.groups || []),
          primary: dns.primary,
          domains: dns.domains || [],
          search_domains_enabled: dns.search_domains_enabled,
        };

        if (overwrite && destId) {
          await this.dest.updateDNSNameserverGroup(destId, data);
        } else {
          await this.dest.createDNSNameserverGroup(data);
        }
        this.result.created++;
        this.emit({
          type: "success",
          resourceType: "dns",
          resourceName: dns.name,
          message: `${overwrite ? "Updated" : "Created"} DNS group: ${dns.name}`,
        });
      } catch (err) {
        if (this.isAlreadyExistsError(err)) {
          this.result.skipped++;
          this.emit({
            type: "progress",
            resourceType: "dns",
            resourceName: dns.name,
            message: `Already exists, skipped DNS group: ${dns.name}`,
          });
        } else {
          this.result.failed++;
          const errMsg = err instanceof Error ? err.message : String(err);
          this.result.errors.push({
            resourceType: "dns",
            name: dns.name,
            error: errMsg,
          });
          this.emit({
            type: "error",
            resourceType: "dns",
            resourceName: dns.name,
            message: `Failed: ${dns.name}: ${errMsg}`,
          });
        }
      }
    }
  }

  private async migrateDNSSettings(resources: SourceResources) {
    const settings = resources.dns_settings;
    if (
      !settings ||
      !settings.disabled_management_groups ||
      settings.disabled_management_groups.length === 0
    ) {
      return;
    }

    try {
      const mappedIds = this.idMap.mapGroupIds(
        settings.disabled_management_groups
      );

      if (mappedIds.length === 0) {
        this.emit({
          type: "progress",
          resourceType: "dns",
          message:
            "DNS settings: no matching destination groups found for disabled management groups, skipping",
        });
        return;
      }

      await this.dest.updateDNSSettings({
        disabled_management_groups: mappedIds,
      });

      this.emit({
        type: "success",
        resourceType: "dns",
        message: `Applied DNS settings: disabled management for ${mappedIds.length} group(s)`,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.emit({
        type: "error",
        resourceType: "dns",
        message: `Failed to apply DNS settings: ${errMsg}`,
      });
    }
  }

  private async migrateDNSZones(
    zones: DNSZone[],
    selectedIds: string[],
    conflictMap: Map<string, Conflict>
  ) {
    if (selectedIds.length === 0) return;

    const selected = zones.filter((z) => selectedIds.includes(z.id));

    for (const zone of selected) {
      const { skip, overwrite, destId } = this.shouldSkip(
        "dns_zones",
        zone.id,
        conflictMap
      );

      if (skip) {
        this.result.skipped++;
        this.emit({
          type: "progress",
          resourceType: "dns_zones",
          resourceName: zone.name,
          message: `Skipped DNS zone: ${zone.name}`,
        });
        continue;
      }

      try {
        const data = {
          name: zone.name,
          domain: zone.domain,
          enabled: zone.enabled,
          enable_search_domain: zone.enable_search_domain,
          distribution_groups: this.idMap.mapGroupIds(
            zone.distribution_groups || []
          ),
        };

        let createdZoneId: string;

        if (overwrite && destId) {
          const updated = await this.dest.updateDNSZone(destId, data);
          createdZoneId = updated.id;
        } else {
          const created = await this.dest.createDNSZone(data);
          createdZoneId = created.id;
        }

        // Create records under the zone
        if (zone.records && zone.records.length > 0) {
          for (const record of zone.records) {
            try {
              await this.dest.createDNSZoneRecord(createdZoneId, {
                name: record.name,
                type: record.type,
                content: record.content,
                ttl: record.ttl,
              });
            } catch (recErr) {
              const msg =
                recErr instanceof Error ? recErr.message : String(recErr);
              this.emit({
                type: "error",
                resourceType: "dns_zones",
                resourceName: `${zone.name}/${record.name}`,
                message: `Failed to create record ${record.name}: ${msg}`,
              });
            }
          }
        }

        this.result.created++;
        this.emit({
          type: "success",
          resourceType: "dns_zones",
          resourceName: zone.name,
          message: `${overwrite ? "Updated" : "Created"} DNS zone: ${zone.name}`,
        });
      } catch (err) {
        if (this.isAlreadyExistsError(err)) {
          this.result.skipped++;
          this.emit({
            type: "progress",
            resourceType: "dns_zones",
            resourceName: zone.name,
            message: `Already exists, skipped DNS zone: ${zone.name}`,
          });
        } else {
          this.result.failed++;
          const errMsg = err instanceof Error ? err.message : String(err);
          this.result.errors.push({
            resourceType: "dns_zones",
            name: zone.name,
            error: errMsg,
          });
          this.emit({
            type: "error",
            resourceType: "dns_zones",
            resourceName: zone.name,
            message: `Failed: ${zone.name}: ${errMsg}`,
          });
        }
      }
    }
  }

  private async migrateNetworks(
    networks: Network[],
    selectedIds: string[],
    conflictMap: Map<string, Conflict>
  ) {
    const selected = networks.filter((n) => selectedIds.includes(n.id));

    // Fetch destination networks for safety check
    const destNetworks = await this.dest.getNetworks();
    const destNetworkByName = new Map(
      destNetworks.map((n) => [n.name.toLowerCase(), n])
    );

    for (const network of selected) {
      const { skip, overwrite } = this.shouldSkip(
        "networks",
        network.id,
        conflictMap
      );

      if (skip) {
        this.result.skipped++;
        this.emit({
          type: "progress",
          resourceType: "networks",
          resourceName: network.name,
          message: `Skipped network: ${network.name}`,
        });
        continue;
      }

      if (overwrite) {
        // Networks API has no PUT endpoint for the network itself - skip to avoid duplicates
        this.result.skipped++;
        this.emit({
          type: "progress",
          resourceType: "networks",
          resourceName: network.name,
          message: `Skipped network (cannot update in-place): ${network.name}`,
        });
        continue;
      }

      // Safety check: skip if network with same name already exists in destination
      if (destNetworkByName.has(network.name.toLowerCase())) {
        this.result.skipped++;
        this.emit({
          type: "progress",
          resourceType: "networks",
          resourceName: network.name,
          message: `Network already exists in destination: ${network.name}`,
        });
        continue;
      }

      try {
        // Create the network
        const created = await this.dest.createNetwork({
          name: network.name,
          description: network.description,
        });

        // Create resources under the network
        if (network.resources) {
          for (const resource of network.resources) {
            try {
              await this.dest.createNetworkResource(created.id, {
                name: resource.name,
                description: resource.description,
                type: resource.type,
                address: resource.address,
                groups: this.idMap.mapGroupIds(
                  resource.groups?.map((g) => g.id) || []
                ),
              });
            } catch (resErr) {
              // Log but don't fail the whole network
              const msg =
                resErr instanceof Error ? resErr.message : String(resErr);
              this.emit({
                type: "error",
                resourceType: "networks",
                resourceName: `${network.name}/${resource.name}`,
                message: `Failed to create resource ${resource.name}: ${msg}`,
              });
            }
          }
        }

        // Create routers under the network (skip peer field, only use peer_groups)
        if (network.routers) {
          for (const router of network.routers) {
            if (!router.peer_groups || router.peer_groups.length === 0) continue;
            try {
              await this.dest.createNetworkRouter(created.id, {
                peer_groups: this.idMap.mapGroupIds(router.peer_groups),
                metric: router.metric,
                masquerade: router.masquerade,
              });
            } catch (routerErr) {
              const msg =
                routerErr instanceof Error
                  ? routerErr.message
                  : String(routerErr);
              this.emit({
                type: "error",
                resourceType: "networks",
                resourceName: `${network.name}/router`,
                message: `Failed to create router: ${msg}`,
              });
            }
          }
        }

        this.result.created++;
        this.emit({
          type: "success",
          resourceType: "networks",
          resourceName: network.name,
          message: `Created network: ${network.name}`,
        });
      } catch (err) {
        this.result.failed++;
        const errMsg = err instanceof Error ? err.message : String(err);
        this.result.errors.push({
          resourceType: "networks",
          name: network.name,
          error: errMsg,
        });
        this.emit({
          type: "error",
          resourceType: "networks",
          resourceName: network.name,
          message: `Failed: ${network.name}: ${errMsg}`,
        });
      }
    }
  }

  private async migrateReverseProxyDomains(
    domains: ReverseProxyDomain[],
    selectedIds: string[],
    conflictMap: Map<string, Conflict>
  ) {
    if (selectedIds.length === 0) return;

    const selected = domains.filter((d) => selectedIds.includes(d.id));
    if (selected.length === 0) return;

    // Pre-fetch destination domains for idempotent skip
    let destDomainNames = new Set<string>();
    try {
      const destDomains = await this.dest.getReverseProxyDomains();
      destDomainNames = new Set(
        destDomains.map((d) => d.domain.toLowerCase())
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.emit({
        type: "error",
        resourceType: "reverse_proxy_domains",
        message: `Failed to fetch destination reverse proxy domains: ${errMsg}`,
      });
      return;
    }

    for (const domain of selected) {
      const { skip } = this.shouldSkip(
        "reverse_proxy_domains",
        domain.id,
        conflictMap
      );

      if (skip) {
        this.result.skipped++;
        this.emit({
          type: "progress",
          resourceType: "reverse_proxy_domains",
          resourceName: domain.domain,
          message: `Skipped domain: ${domain.domain}`,
        });
        continue;
      }

      if (destDomainNames.has(domain.domain.toLowerCase())) {
        this.result.skipped++;
        this.emit({
          type: "progress",
          resourceType: "reverse_proxy_domains",
          resourceName: domain.domain,
          message: `Domain already exists in destination: ${domain.domain}`,
        });
        continue;
      }

      try {
        await this.dest.createReverseProxyDomain({ domain: domain.domain });
        destDomainNames.add(domain.domain.toLowerCase());
        this.result.created++;
        this.emit({
          type: "success",
          resourceType: "reverse_proxy_domains",
          resourceName: domain.domain,
          message: `Created domain: ${domain.domain}`,
        });
      } catch (err) {
        if (this.isAlreadyExistsError(err)) {
          this.result.skipped++;
          destDomainNames.add(domain.domain.toLowerCase());
          this.emit({
            type: "progress",
            resourceType: "reverse_proxy_domains",
            resourceName: domain.domain,
            message: `Already exists, skipped domain: ${domain.domain}`,
          });
        } else {
          this.result.failed++;
          const errMsg = err instanceof Error ? err.message : String(err);
          this.result.errors.push({
            resourceType: "reverse_proxy_domains",
            name: domain.domain,
            error: errMsg,
          });
          this.emit({
            type: "error",
            resourceType: "reverse_proxy_domains",
            resourceName: domain.domain,
            message: `Failed: ${domain.domain}: ${errMsg}`,
          });
        }
      }
    }
  }

  private async migrateReverseProxyServices(
    services: ReverseProxyService[],
    selectedIds: string[],
    conflictMap: Map<string, Conflict>
  ) {
    if (selectedIds.length === 0) return;

    const selected = services.filter((s) => selectedIds.includes(s.id));
    if (selected.length === 0) return;

    // Pre-fetch destination services to support skip / overwrite
    let destServiceByName = new Map<string, ReverseProxyService>();
    try {
      const destServices = await this.dest.getReverseProxyServices();
      destServiceByName = new Map(
        destServices.map((s) => [s.name.toLowerCase(), s])
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.emit({
        type: "error",
        resourceType: "reverse_proxy_services",
        message: `Failed to fetch destination reverse proxy services: ${errMsg}`,
      });
      return;
    }

    for (const service of selected) {
      // Skip ephemeral services — they're short-lived CLI exposures
      if (service.source === "ephemeral") {
        this.result.skipped++;
        this.emit({
          type: "progress",
          resourceType: "reverse_proxy_services",
          resourceName: service.name,
          message: `Skipped ephemeral service: ${service.name}`,
        });
        continue;
      }

      const { skip, overwrite, destId } = this.shouldSkip(
        "reverse_proxy_services",
        service.id,
        conflictMap
      );

      if (skip) {
        this.result.skipped++;
        this.emit({
          type: "progress",
          resourceType: "reverse_proxy_services",
          resourceName: service.name,
          message: `Skipped service: ${service.name}`,
        });
        continue;
      }

      // Safety check: if not overwriting and same-named service exists, skip
      if (!overwrite && destServiceByName.has(service.name.toLowerCase())) {
        this.result.skipped++;
        this.emit({
          type: "progress",
          resourceType: "reverse_proxy_services",
          resourceName: service.name,
          message: `Service already exists in destination: ${service.name}`,
        });
        continue;
      }

      try {
        const mappedAuth = service.authentication
          ? {
              ...service.authentication,
              userGroups: service.authentication.userGroups
                ? this.idMap.mapGroupIds(service.authentication.userGroups)
                : undefined,
            }
          : undefined;

        const data = {
          name: service.name,
          description: service.description,
          domain: service.domain,
          protocol: service.protocol,
          targets: service.targets,
          authentication: mappedAuth,
          accessControl: service.accessControl,
          advancedSettings: service.advancedSettings,
        };

        if (overwrite && destId) {
          await this.dest.updateReverseProxyService(destId, data);
        } else {
          await this.dest.createReverseProxyService(data);
        }
        this.result.created++;
        this.emit({
          type: "success",
          resourceType: "reverse_proxy_services",
          resourceName: service.name,
          message: `${overwrite ? "Updated" : "Created"} service: ${service.name}`,
        });
      } catch (err) {
        if (this.isAlreadyExistsError(err)) {
          this.result.skipped++;
          this.emit({
            type: "progress",
            resourceType: "reverse_proxy_services",
            resourceName: service.name,
            message: `Already exists, skipped service: ${service.name}`,
          });
        } else {
          this.result.failed++;
          const errMsg = err instanceof Error ? err.message : String(err);
          this.result.errors.push({
            resourceType: "reverse_proxy_services",
            name: service.name,
            error: errMsg,
          });
          this.emit({
            type: "error",
            resourceType: "reverse_proxy_services",
            resourceName: service.name,
            message: `Failed: ${service.name}: ${errMsg}`,
          });
        }
      }
    }
  }

  private async migrateAuthSettings(resources: SourceResources, selectedIds: string[]) {
    if (selectedIds.length === 0) return;

    const src = resources.account_settings;
    if (!src) return;

    try {
      const destAccounts = await this.dest.getAccounts();
      if (!destAccounts || destAccounts.length === 0) {
        this.emit({
          type: "error",
          message: "Failed to apply authentication settings: no destination account found",
        });
        return;
      }

      const destAccount = destAccounts[0];
      const destSettings = destAccount.settings;

      // Merge: start with destination's current settings, override only selected auth fields
      const merged: Record<string, unknown> = { ...destSettings };
      const appliedSettings: string[] = [];

      if (selectedIds.includes("peer_login_expiration")) {
        if (src.peer_login_expiration_enabled !== undefined) {
          merged.peer_login_expiration_enabled = src.peer_login_expiration_enabled;
        }
        if (src.peer_login_expiration !== undefined) {
          merged.peer_login_expiration = src.peer_login_expiration;
        }
        if (src.peer_login_expiration_enabled && src.peer_login_expiration) {
          const days = Math.round(src.peer_login_expiration / 86400);
          appliedSettings.push(`peer session expiration ${days} day${days !== 1 ? "s" : ""}`);
        } else {
          appliedSettings.push("peer session expiration disabled");
        }
      }

      if (selectedIds.includes("peer_inactivity_expiration")) {
        if (src.peer_inactivity_expiration_enabled !== undefined) {
          merged.peer_inactivity_expiration_enabled = src.peer_inactivity_expiration_enabled;
        }
        if (src.peer_inactivity_expiration !== undefined) {
          merged.peer_inactivity_expiration = src.peer_inactivity_expiration;
        }
        if (src.peer_inactivity_expiration_enabled) {
          const mins = Math.round((src.peer_inactivity_expiration || 0) / 60);
          appliedSettings.push(`inactivity expiration ${mins} min`);
        } else {
          appliedSettings.push("inactivity expiration disabled");
        }
      }

      if (selectedIds.includes("dns_domain") && src.dns_domain) {
        merged.dns_domain = src.dns_domain;
        appliedSettings.push(`DNS domain: ${src.dns_domain}`);
      }

      if (selectedIds.includes("network_range") && src.network_range) {
        merged.network_range = src.network_range;
        appliedSettings.push(`network range: ${src.network_range}`);
      }

      if (selectedIds.includes("network_range_v6") && src.network_range_v6) {
        merged.network_range_v6 = src.network_range_v6;
        appliedSettings.push(`IPv6 network range: ${src.network_range_v6}`);
      }

      if (selectedIds.includes("ipv6_enabled_groups") && src.ipv6_enabled_groups) {
        const mappedGroups = this.idMap.mapGroupIds(src.ipv6_enabled_groups);
        merged.ipv6_enabled_groups = mappedGroups;
        appliedSettings.push(
          `IPv6 enabled groups: ${mappedGroups.length} group${mappedGroups.length !== 1 ? "s" : ""}`
        );
      }

      if (selectedIds.includes("routing_peer_dns_resolution_enabled") && src.routing_peer_dns_resolution_enabled !== undefined) {
        merged.routing_peer_dns_resolution_enabled = src.routing_peer_dns_resolution_enabled;
        appliedSettings.push(src.routing_peer_dns_resolution_enabled ? "DNS wildcard routing enabled" : "DNS wildcard routing disabled");
      }

      if (selectedIds.includes("peer_approval") || selectedIds.includes("user_approval")) {
        const extraMerged: Record<string, unknown> = {
          ...(destSettings.extra as Record<string, unknown> || {}),
        };
        if (selectedIds.includes("peer_approval") && src.extra?.peer_approval_enabled !== undefined) {
          extraMerged.peer_approval_enabled = src.extra.peer_approval_enabled;
          appliedSettings.push(src.extra.peer_approval_enabled ? "peer approval enabled" : "peer approval disabled");
        }
        if (selectedIds.includes("user_approval") && src.extra?.user_approval_required !== undefined) {
          extraMerged.user_approval_required = src.extra.user_approval_required;
          appliedSettings.push(src.extra.user_approval_required ? "user approval required" : "user approval not required");
        }
        merged.extra = extraMerged;
      }

      if (selectedIds.includes("auto_update_version") && src.auto_update_version !== undefined) {
        merged.auto_update_version = src.auto_update_version;
        appliedSettings.push(`automatic updates: ${src.auto_update_version}`);
      }

      if (selectedIds.includes("lazy_connection_enabled") && src.lazy_connection_enabled !== undefined) {
        merged.lazy_connection_enabled = src.lazy_connection_enabled;
        appliedSettings.push(src.lazy_connection_enabled ? "lazy connections enabled" : "lazy connections disabled");
      }

      await this.dest.updateAccount(destAccount.id, merged);

      for (const setting of appliedSettings) {
        this.emit({
          type: "success",
          message: `Applied setting: ${setting}`,
        });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.emit({
        type: "error",
        message: `Failed to apply authentication settings: ${errMsg}`,
      });
    }
  }
}

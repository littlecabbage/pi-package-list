import { groupedSectionToList, isHiddenWelcomeSectionText, parseSectionKey, sectionToList, type NamedScopeGroup, type WelcomeMetadataStore } from "./list.ts";

import { localPackageName } from "./package-name.ts";

const PATCH_FLAG = Symbol.for("pi-package-list:loaded-resources");
const HOST_REF = Symbol.for("pi-package-list:host-instance");

export type LoadedExtension = {
	name: string;
	metadataNames: string[];
	paths: string[];
};

function shouldHideLoadedChild(child: unknown): boolean {
	if (!child || typeof child !== "object") return false;
	const candidate = child as ExpandableChild;
	const getText = candidate.getCollapsedText ?? candidate.build;
	if (typeof getText !== "function") return false;
	return isHiddenWelcomeSectionText(getText.call(child));
}

function isSpacerChild(child: unknown): boolean {
	if (!child || typeof child !== "object") return false;
	if ("spacer" in child && Boolean((child as { spacer?: unknown }).spacer)) return true;
	const candidate = child as { lines?: unknown; render?: unknown };
	return typeof candidate.lines === "number" && typeof candidate.render === "function";
}

type ExpandableChild = {
	build?: () => string;
	state?: { expanded: boolean };
	invalidate?: () => void;
	getCollapsedText?: () => string;
	getExpandedText?: () => string;
	setExpanded?: (expanded: boolean) => void;
	setText?: (text: string) => void;
};

function patchExpandable(
	child: ExpandableChild,
	expanded: boolean,
	store?: WelcomeMetadataStore,
	groups?: NamedScopeGroup[],
): void {
	const compact = (text: string) => groups
		? groupedSectionToList(text, groups, store)
		: sectionToList(text, "compact", { store });
	// Newer Pi keeps text factories in a closure and exposes ThemedText.build.
	if (typeof child.getCollapsedText !== "function") {
		if (typeof child.build !== "function" || typeof child.setExpanded !== "function") return;
		const originalBuild = child.build.bind(child);
		child.build = () => {
			const text = originalBuild();
			if (!parseSectionKey(text.split(/\r?\n/, 1)[0] ?? "")) return text;
			return child.state?.expanded ? sectionToList(text, "expanded") : compact(text);
		};
		child.invalidate?.();
		return;
	}
	const origCollapsed = child.getCollapsedText.bind(child);
	const origExpanded = typeof child.getExpandedText === "function"
		? child.getExpandedText.bind(child)
		: undefined;
	child.getCollapsedText = () => compact(origCollapsed());
	if (origExpanded) {
		child.getExpandedText = () => sectionToList(origExpanded(), "expanded");
	}
	if (typeof child.setExpanded === "function") {
		child.setExpanded(expanded);
		return;
	}
	if (typeof child.setText === "function") {
		const text = expanded && child.getExpandedText
			? child.getExpandedText()
			: child.getCollapsedText();
		child.setText(text);
	}
}

type ResourceItem = { path: string; hidden?: boolean; sourceInfo?: { source?: string } };
type HostScopeGroup = {
	scope: string;
	paths: ResourceItem[];
	packages: Map<string, ResourceItem[]>;
};
type HostInstance = {
	loadedResourcesContainer?: { addChild: (child: unknown) => unknown };
	buildScopeGroups?: (items: ResourceItem[]) => HostScopeGroup[];
	getCompactExtensionLabels?: (items: ResourceItem[]) => string[];
	getCompactPackageSourceLabel?: (sourceInfo: unknown) => string;
	getStartupExpansionState?: () => boolean;
	showLoadedResources?: (options?: unknown) => unknown;
	ui?: { requestRender: () => void };
	session?: {
		resourceLoader?: {
			getSkills: () => { skills: { filePath: string; name: string }[] };
			getExtensions?: () => { extensions: ResourceItem[] };
		};
		promptTemplates?: { filePath: string; name: string }[];
	};
};

function nameScopeGroups(
	host: HostInstance,
	section: string,
	groups: HostScopeGroup[],
	extensionLabels: Map<string, string>,
): NamedScopeGroup[] | undefined {
	let labels: Map<string, string>;
	if (section === "extensions") {
		labels = extensionLabels;
	} else if (section === "skills" && host.session?.resourceLoader) {
		labels = new Map(host.session.resourceLoader.getSkills().skills.map((item) => [item.filePath, item.name]));
	} else if (section === "prompts" && host.session?.promptTemplates) {
		labels = new Map(host.session.promptTemplates.map((item) => [item.filePath, `/${item.name}`]));
	} else {
		return undefined;
	}
	// Do not guess names or silently drop resources if host metadata changes.
	const items = groups.flatMap((group) => [...group.paths, ...Array.from(group.packages.values()).flat()]);
	if (items.some((item) => !labels.has(item.path))) return undefined;
	return groups.map((group) => ({
		scope: group.scope,
		paths: group.paths.map((item) => section === "extensions"
			? { name: extensionDisplayName(host, item, labels.get(item.path)!), metadataNames: [labels.get(item.path)!] }
			: labels.get(item.path)!),
		packages: Array.from(group.packages, ([source, items]) => [
			source,
			items.map((item) => labels.get(item.path)!),
			host.getCompactPackageSourceLabel?.(items[0]?.sourceInfo),
		]),
	}));
}

function extensionDisplayName(host: HostInstance, item: ResourceItem, label: string): string {
	const source = item.sourceInfo?.source ?? "";
	if (source.startsWith("npm:") || source.startsWith("git:")) {
		return host.getCompactPackageSourceLabel?.(item.sourceInfo) ?? source.replace(/^(npm:|git:)/, "");
	}
	return localPackageName(item.path) ?? label.replace(/\.(?:[cm]?[jt]s)$/, "");
}

type HostInteractiveMode = {
	prototype?: {
		showLoadedResources?: (options?: unknown) => unknown;
		[PATCH_FLAG]?: boolean;
		[HOST_REF]?: WeakRef<HostInstance>;
	};
};

/** Read the active host's loaded extensions, not arbitrary installed packages. */
export function getLoadedExtensions(InteractiveMode: HostInteractiveMode): LoadedExtension[] {
	const host = InteractiveMode.prototype?.[HOST_REF]?.deref();
	const getExtensions = host?.session?.resourceLoader?.getExtensions;
	if (!host || !getExtensions || !host.getCompactExtensionLabels) {
		throw new Error("无法读取已加载插件，请重启 Pi 后再执行此命令（仅支持 TUI 模式）。");
	}
	const items = getExtensions.call(host.session!.resourceLoader).extensions.filter((item) => !item.hidden);
	const labels = host.getCompactExtensionLabels(items);
	const inventory = new Map<string, LoadedExtension>();
	items.forEach((item, index) => {
		const name = extensionDisplayName(host, item, labels[index]);
		const entry = inventory.get(name) ?? { name, metadataNames: [], paths: [] };
		if (!entry.metadataNames.includes(labels[index])) entry.metadataNames.push(labels[index]);
		if (!entry.paths.includes(item.path)) entry.paths.push(item.path);
		inventory.set(name, entry);
	});
	return [...inventory.values()];
}

export function refreshLoadedResources(InteractiveMode: HostInteractiveMode): void {
	const host = InteractiveMode.prototype?.[HOST_REF]?.deref();
	host?.showLoadedResources?.({ force: true });
	host?.ui?.requestRender();
}

export function installPackageListPatch(
	InteractiveMode: HostInteractiveMode,
	store?: WelcomeMetadataStore,
): boolean {
	const proto = InteractiveMode?.prototype as {
		showLoadedResources?: (options?: unknown) => unknown;
		[PATCH_FLAG]?: boolean;
		[HOST_REF]?: WeakRef<HostInstance>;
	} | undefined;
	if (!proto || typeof proto.showLoadedResources !== "function" || proto[PATCH_FLAG]) {
		return false;
	}
	const original = proto.showLoadedResources;
	proto.showLoadedResources = function patchedShowLoadedResources(options?: unknown) {
		const host = this as HostInstance;
		proto[HOST_REF] = new WeakRef(host);
		const container = host.loadedResourcesContainer;
		if (!container || typeof container.addChild !== "function") {
			return original.call(this, options);
		}
		const origAdd = container.addChild;
		const expanded = typeof (this as { getStartupExpansionState?: () => boolean }).getStartupExpansionState === "function"
			? Boolean((this as { getStartupExpansionState: () => boolean }).getStartupExpansionState())
			: false;
		// Capture the same source groups and compact labels Pi builds for this listing.
		const originalGroups = host.buildScopeGroups;
		const originalLabels = host.getCompactExtensionLabels;
		const hadOwnGroups = Object.hasOwn(host, "buildScopeGroups");
		const hadOwnLabels = Object.hasOwn(host, "getCompactExtensionLabels");
		let pendingGroups: HostScopeGroup[] | undefined;
		let extensionLabels = new Map<string, string>();
		if (originalGroups) host.buildScopeGroups = function (items) {
			pendingGroups = originalGroups.call(this, items);
			return pendingGroups;
		};
		if (originalLabels) host.getCompactExtensionLabels = function (items) {
			const labels = originalLabels.call(this, items);
			extensionLabels = new Map(items.map((item, index) => [item.path, labels[index]]));
			return labels;
		};
		let skipFollowingSpacer = false;
		container.addChild = function patchedAddChild(child: unknown) {
			if (shouldHideLoadedChild(child)) {
				skipFollowingSpacer = true;
				return child;
			}
			if (skipFollowingSpacer) {
				skipFollowingSpacer = false;
				if (isSpacerChild(child)) return child;
			}
			if (child && typeof child === "object") {
				const candidate = child as ExpandableChild;
				const getText = candidate.getCollapsedText ?? candidate.build;
				const section = typeof getText === "function"
					? parseSectionKey(getText.call(candidate).split(/\r?\n/, 1)[0] ?? "")
					: undefined;
				const groups = section && pendingGroups
					? nameScopeGroups(host, section, pendingGroups, extensionLabels)
					: undefined;
				if (section) pendingGroups = undefined;
				patchExpandable(candidate, expanded, store, groups);
			}
			return origAdd.call(this, child);
		};
		try {
			return original.call(this, options);
		} finally {
			container.addChild = origAdd;
			if (originalGroups) {
				if (hadOwnGroups) host.buildScopeGroups = originalGroups;
				else delete host.buildScopeGroups;
			}
			if (originalLabels) {
				if (hadOwnLabels) host.getCompactExtensionLabels = originalLabels;
				else delete host.getCompactExtensionLabels;
			}
		}
	};
	proto[PATCH_FLAG] = true;
	return true;
}

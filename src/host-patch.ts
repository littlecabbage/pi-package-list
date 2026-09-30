import { isHiddenWelcomeSectionText, parseSectionKey, sectionToList, type WelcomeMetadataStore } from "./list.ts";

const PATCH_FLAG = Symbol.for("pi-package-list:loaded-resources");

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
): void {
	// Newer Pi keeps text factories in a closure and exposes ThemedText.build.
	if (typeof child.getCollapsedText !== "function") {
		if (typeof child.build !== "function" || typeof child.setExpanded !== "function") return;
		const originalBuild = child.build.bind(child);
		child.build = () => {
			const text = originalBuild();
			if (!parseSectionKey(text.split(/\r?\n/, 1)[0] ?? "")) return text;
			return sectionToList(text, child.state?.expanded ? "expanded" : "compact", { store });
		};
		child.invalidate?.();
		return;
	}
	const origCollapsed = child.getCollapsedText.bind(child);
	const origExpanded = typeof child.getExpandedText === "function"
		? child.getExpandedText.bind(child)
		: undefined;
	child.getCollapsedText = () => sectionToList(origCollapsed(), "compact", { store });
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

type HostInteractiveMode = {
	prototype?: {
		showLoadedResources?: (options?: unknown) => unknown;
		[PATCH_FLAG]?: boolean;
	};
};

export function installPackageListPatch(
	InteractiveMode: HostInteractiveMode,
	store?: WelcomeMetadataStore,
): boolean {
	const proto = InteractiveMode?.prototype as {
		showLoadedResources?: (options?: unknown) => unknown;
		[PATCH_FLAG]?: boolean;
	} | undefined;
	if (!proto || typeof proto.showLoadedResources !== "function" || proto[PATCH_FLAG]) {
		return false;
	}
	const original = proto.showLoadedResources;
	proto.showLoadedResources = function patchedShowLoadedResources(options?: unknown) {
		const container = (this as { loadedResourcesContainer?: { addChild: (child: unknown) => unknown } })
			.loadedResourcesContainer;
		if (!container || typeof container.addChild !== "function") {
			return original.call(this, options);
		}
		const origAdd = container.addChild;
		const expanded = typeof (this as { getStartupExpansionState?: () => boolean }).getStartupExpansionState === "function"
			? Boolean((this as { getStartupExpansionState: () => boolean }).getStartupExpansionState())
			: false;
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
				patchExpandable(child as ExpandableChild, expanded, store);
			}
			return origAdd.call(this, child);
		};
		try {
			return original.call(this, options);
		} finally {
			container.addChild = origAdd;
		}
	};
	proto[PATCH_FLAG] = true;
	return true;
}

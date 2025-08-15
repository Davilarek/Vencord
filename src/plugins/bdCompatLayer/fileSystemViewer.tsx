/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { classNameFactory } from "@api/Styles";
import { FolderIcon, PlusIcon, RestartIcon } from "@components/Icons";
import { QuickAction, QuickActionCard } from "@components/settings/QuickAction";
import { SettingsTab, wrapTab } from "@components/settings/tabs";
import { Plugin } from "@utils/types";
import { Card, Forms, React, useRef } from "@webpack/common";

import { PLUGIN_NAME } from "./constants";
import { getGlobalApi } from "./fakeBdApi";
import { addCustomPlugin, convertPlugin } from "./pluginConstructor";
import TreeView, { findInTree, TreeNode } from "./treeView";
import { FSUtils, readdirPromise, reloadCompatLayer, ZIPUtils } from "./utils";

type SettingsPlugin = Plugin & {
    customSections: ((ID: Record<string, unknown>) => any)[];
};

const TabName = "Virtual Filesystem";
const cl = classNameFactory("vc-settings-");

function makeTab() {
    const baseNode = {
        id: "fs-/",
        label: "/",
        children: [],
        // expanded: true,
        expanded: false,
        fetchChildren: function () { return fetchDirContentForId(this.id); },
        // createExpanded: true,
    } as TreeNode;

    // const [selectedNode, setSelectedNode] = useState<TreeNode>(baseNode);

    // const handleNodeSelect = (node: TreeNode) => {
    //     console.log(node);
    //     console.log(selectedNode);
    //     setSelectedNode(node);
    // };
    // const [selectedNode, setSelectedNode] = useState<string>(baseNode.id);
    const ref = useRef(baseNode.id);

    const handleNodeSelect = (node: TreeNode) => {
        console.log(node);
        // console.log(selectedNode);
        console.log(ref.current);
        // setSelectedNode(node.id);
        ref.current = node.id;
    };

    const contextMenuHandler = (event: MouseEvent) => {
        // console.log(event);
        const contextMenuBuild = () => {
            // @ts-ignore
            return getGlobalApi().ContextMenu.buildMenu([
                { label: ref.current, disabled: true },
                findInTree(baseNode, x => x.expandable === true && x.id === ref.current)?.expandable && {
                    label: "Import a file here",
                    action: async () => {
                        await FSUtils.importFile(ref.current.split("fs-")[1], true);
                        // console.log(ref.current.split("fs-")[1]);
                        findInTree(baseNode, x => x.id === ref.current)?.fetchChildren();
                    },
                },
                findInTree(baseNode, x => x.expandable === true && x.id === ref.current)?.expandable && {
                    label: "Remove directory and all subdirectories",
                    color: "danger",
                    action: () => {
                        getGlobalApi().UI.showConfirmationModal(
                            "Confirm your action",
                            `Are you sure you want to delete ${findInTree(baseNode, x => x.expandable === true && x.id === ref.current)?.label} and all of it's children? This cannot be undone.`,
                            {
                                confirmText: "Yes",
                                cancelText: "No",
                                onConfirm: () => {
                                    FSUtils.removeDirectoryRecursive(ref.current.split("fs-")[1]);
                                },
                                onCancel: () => undefined
                            }
                        );
                    },
                },
                (!findInTree(baseNode, x => x.expandable === true && x.id === ref.current)?.expandable) && {
                    label: "Export file",
                    action: async () => {
                        await FSUtils.exportFile(ref.current.split("fs-")[1]);
                    },
                },
                (!findInTree(baseNode, x => x.expandable === true && x.id === ref.current)?.expandable) && {
                    label: "Delete file",
                    color: "danger",
                    action: () => {
                        window.require("fs").unlink(ref.current.split("fs-")[1]);
                    },
                },
                (!findInTree(baseNode, x => x.expandable === true && x.id === ref.current)?.expandable) && ref.current.endsWith(".plugin.js") && {
                    type: "group",
                    items: [
                        {
                            type: "submenu",
                            label: "Plugin actions",
                            items: [
                                {
                                    // label: "(Re)Load plugin",
                                    label: "Reload plugin",
                                    action: () => {
                                        const selected = ref.current.split("fs-")[1];
                                        const parsed: { dir: string, base: string; } = window.require("path").parse(selected);
                                        parsed.dir = parsed.dir.startsWith("//") ? parsed.dir.slice(1) : parsed.dir;
                                        // eslint-disable-next-line eqeqeq
                                        const foundOrNot = getGlobalApi().Plugins.getAll().find(x => x.sourcePath == parsed.dir && x.filename == parsed.base);
                                        // if (!foundOrNot) {
                                        //     const converted = convertPlugin(window.require("fs").readFileSync(selected, "utf8"), parsed.base, true, parsed.dir);
                                        //     converted.then(x => {
                                        //         addCustomPlugin(x);
                                        //     });
                                        // }
                                        if (foundOrNot) {
                                            (async () => { // TODO: move to a separate function
                                                Vencord.Settings.plugins[foundOrNot.name].enabled = false;
                                                if (foundOrNot.started === true) {
                                                    const currentStatus = Vencord.Settings.plugins[PLUGIN_NAME].pluginsStatus[foundOrNot.name];
                                                    Vencord.Plugins.stopPlugin(foundOrNot as Plugin);
                                                    if (currentStatus === true)
                                                        Vencord.Settings.plugins[PLUGIN_NAME].pluginsStatus[foundOrNot.name] = currentStatus;
                                                }
                                                delete Vencord.Plugins.plugins[foundOrNot.name];
                                                (window.GeneratedPlugins as any[]).splice((window.GeneratedPlugins as any[]).indexOf(foundOrNot), 1);

                                                await new Promise((resolve, reject) => setTimeout(resolve, 500));

                                                const convertPromise = convertPlugin(window.require("fs").readFileSync(selected, "utf8"), parsed.base, true, parsed.dir);
                                                const converted = await convertPromise;
                                                addCustomPlugin(converted);
                                            })();
                                        }
                                    },
                                }
                            ],
                        }
                    ]
                }
            ].filter(Boolean));
        };
        // @ts-ignore
        getGlobalApi().ContextMenu.open(event, contextMenuBuild(), {});
    };

    // const [sizeOfRoot, setSizeOfRoot] = React.useState("Loading");
    // const getSizeOfRoot = async () => {
    // }

    return <SettingsTab title={TabName}>
        <Forms.FormSection title="File System Actions">
            <QuickActionCard>
                <QuickAction text="Export Filesystem as ZIP" action={() => ZIPUtils.downloadZip()} Icon={FolderIcon}/>
                <QuickAction text="Import Filesystem From ZIP" action={() => ZIPUtils.importZip()} Icon={FolderIcon}/>
                <QuickAction text="Reload BD Plugins" action={() => reloadCompatLayer()} Icon={RestartIcon}/>
                <QuickAction text="Import BD Plugin" action={async () => await FSUtils.importFile("//BD/plugins", true, false, ".js")} Icon={PlusIcon}/>
                <QuickAction text="Import Bulk Plugins" action={async () => await FSUtils.importFile("//BD/plugins", true, true, ".js")} Icon={FolderIcon}/>
            </QuickActionCard>
                  <Card className={cl("quick-actions-card")}>
                    <Forms.FormText>Size of `/`: {
                        (() => {
                            try {
                                return ((FSUtils.getDirectorySize("/") / 1024) / 1024).toFixed(2);
                            } catch (error) {
                                console.error("This error probably indicates filesystem breakage...", error);
                                return "ERROR, CHECK CONSOLE";
                            }
                        })()
                    } MB</Forms.FormText>
            </Card>
        </Forms.FormSection>
        {/* <TreeView onContextMenu={contextMenuHandler} selectedNode={selectedNode} selectNode={handleNodeSelect} data={ */}
        <TreeView onContextMenu={contextMenuHandler} selectedNode={ref.current} selectNode={handleNodeSelect} data={
            [
                baseNode
            ]
        }></TreeView>
    </SettingsTab >;
}

async function fetchDirContentForId(id: string) {
    const fs = window.require("fs");
    const dirContents = await readdirPromise(id.split("fs-")[1]) as string[];
    return dirContents.map(x => {
        return {
            id: "fs-" + id.split("fs-")[1] + "/" + x,
            label: x,
            children: [],
            fetchChildren: function () { return fetchDirContentForId(this.id); },
            // expanded: nodeStateStore["fs-" + id.split("fs-")[1] + "/" + x]?.expanded ?? false,
            expanded: false,
            expandable: !fs.statSync(id.split("fs-")[1] + "/" + x).isFile(),
            // createExpanded: nodeStateStore["fs-" + id.split("fs-")[1] + "/" + x]?.expanded ?? false,
        } as TreeNode;
    });
}

function createFilesSystemViewTab(ID: Record<string, unknown>) {
    return {
        section: "VencordBDCompatFS", // workaround
        label: TabName,
        element: wrapTab(makeTab, TabName),
        className: "bv-fs-view",
    };
}

export function injectSettingsTabs() {
    const settingsPlugin = Vencord.Plugins.plugins.Settings as SettingsPlugin;
    const { customSections } = settingsPlugin;
    // if (customSections.find(x=>x)) {
    // }
    customSections.push(createFilesSystemViewTab);
}

export function unInjectSettingsTab() {
    const settingsPlugin = Vencord.Plugins.plugins.Settings as SettingsPlugin;
    const { customSections } = settingsPlugin;
    customSections.splice(customSections.findIndex(x => x({}).className === createFilesSystemViewTab({}).className), 1);
}

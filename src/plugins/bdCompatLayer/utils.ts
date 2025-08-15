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

import { Link } from "@components/Link";
import { PluginNative } from "@utils/types";
import { Forms, lodash, React } from "@webpack/common";
import * as fflate from "fflate";

import { getGlobalApi } from "./fakeBdApi";
import { addCustomPlugin, convertPlugin, removeAllCustomPlugins } from "./pluginConstructor";

export function getDeferred<T = any>() {
    let resolve: (value: T | PromiseLike<T>) => void;
    let reject: (reason?: any) => void;

    const promise = new Promise<T>((resolveCb, rejectCb) => {
        resolve = resolveCb;
        reject = rejectCb;
    });

    return { resolve: resolve!, reject: reject!, promise };
}

// export function evalInScope(js, contextAsScope) {
//     return new Function(`with (this) { return (${js}); }`).call(contextAsScope);
// }
export function evalInScope(js: string, contextAsScope: any) {
    // @ts-ignore
    // eslint-disable-next-line quotes
    return new Function(["contextAsScope", "js"], "return (function() { with(this) { return eval(js); } }).call(contextAsScope)")(contextAsScope, js);
}

export function addLogger() {
    const log_ = (type: "log" | "warn" | "error", ...stuff: any[]) => {
        console[type]("[BV Compat Layer Plugin Ivoked Log]:", ...stuff);
    };
    return {
        warn: function (...args) {
            log_("warn", ...args);
        },
        info: function (...args) {
            log_("log", ...args);
        },
        err: function (...args) {
            log_("error", ...args);
        },
        stacktrace: function (...args) {
            log_("error", ...args);
        },
        error: function (...args) {
            log_("error", ...args);
        },
        log: function (...args) {
            log_("log", ...args);
        },
    };
}

export function simpleGET(url: string, headers?: any) {
    var httpRequest = new XMLHttpRequest();

    httpRequest.open("GET", url, false);
    if (headers)
        for (const header in headers) {
            httpRequest.setRequestHeader(header, headers[header]);
        }
    httpRequest.send();
    return httpRequest;
}

export function findFirstLineWithoutX(str, x) {
    const lines = str.split("\n");
    for (let i = 0; i < lines.length; i++) {
        if (!lines[i].startsWith(x)) {
            return i + 1; // Return line number (1-indexed)
        }
    }
    return -1; // If no line is found, return -1
}

export function evalInContext(js, context) {
    // Return the results of the in-line anonymous function we .call with the passed context
    return function () {
        return window.eval(js);
    }.call(context);
}

export function readdirPromise(filename) {
    const fs = window.require("fs");
    return new Promise((resolve, reject) => {
        fs.readdir(filename, (err, files) => {
            if (err)
                reject(err);
            else
                resolve(files);
        });
    });
}

// export function injectZipToWindow() {
//     window.eval(
//         simpleGET(
//             "https://raw.githubusercontent.com/gildas-lormeau/zip.js/master/dist/zip.min.js"
//         ).responseText
//     );
// }

export function createTextForm(field1: React.ReactNode | string, field2: string, asLink = false, linkLabel = field2) {
    return React.createElement(
        "div",
        {},
        React.createElement(
            Forms.FormTitle,
            {
                tag: "h3",
            },
            [
                field1,
                React.createElement(
                    Forms.FormText,
                    {},
                    asLink ? React.createElement(Link, { href: field2 }, linkLabel) : field2,
                ),
            ]
        ),
    );
}

export function objectToString(obj: any) {
    if (typeof obj === "function") {
        return obj.toString();
    }

    if (typeof obj !== "object" || obj === null) {
        return String(obj);
    }

    let str = "{";
    let isFirst = true;

    for (const key in obj) {
        // eslint-disable-next-line no-prototype-builtins
        if (obj.hasOwnProperty(key)) {
            const descriptor = Object.getOwnPropertyDescriptor(obj, key);

            if (!isFirst) {
                str += ", ";
            }
            isFirst = false;

            if (!descriptor) {
                // uhh how did we get here?
                continue;
            }

            if (descriptor.get) {
                str += `${String(descriptor.get)}`;
            } else {
                str += key + ": " + objectToString(obj[key]);
            }
        }
    }

    str += "}";
    return str;
}

export function openFileSelect(filter = "*", bulk = false) {
    return new Promise<File | File[]>((resolve, reject) => {
        const input = document.createElement("input");
        input.type = "file";
        input.multiple = bulk;
        input.accept = filter;
        const timeout = setTimeout(() => {
            reject();
            // so we don't wait forever
        }, 30 * 60 * 1000);
        input.addEventListener("change", () => {
            if (input.files && input.files.length > 0) {
                clearTimeout(timeout);
                resolve(bulk ? Array.from(input.files) : input.files[0]);
            } else {
                clearTimeout(timeout);
                reject("No file selected.");
            }
        });

        input.click();
    });
}

export async function reloadCompatLayer() {
    console.warn("Removing plugins...");
    await removeAllCustomPlugins();
    await new Promise((resolve, reject) => setTimeout(resolve, 500));
    const localFs = window.require("fs");
    const pluginFolder = localFs
        .readdirSync(getGlobalApi().Plugins.folder)
        .sort();
    const plugins = pluginFolder.filter(x =>
        x.endsWith(".plugin.js")
    );
    for (let i = 0; i < plugins.length; i++) {
        const element = plugins[i];
        const pluginJS = localFs.readFileSync(
            getGlobalApi().Plugins.folder + "/" + element,
            "utf8"
        );
        const conv = convertPlugin(pluginJS, element, true, getGlobalApi().Plugins.folder);
        conv.then(plugin => {
            addCustomPlugin(plugin);
        });
        conv.catch(what => {
            console.error("Error during conversion of", element, "what was:", what);
        });
    }
}

export function docCreateElement(tag: string, props: Record<string, any> = {}, childNodes: Node[] = [], attrs: Record<string, string> = {}) {
    const element = document.createElement(tag);

    for (const [key, value] of Object.entries<string | any>(props)) {
        element[key] = value;
    }

    for (const node of childNodes) {
        if (node instanceof Node) {
            element.appendChild(node);
        }
    }

    for (const [key, value] of Object.entries<string>(attrs)) {
        element.setAttribute(key, value);
    }

    return element;
}

export const FSUtils = {
    readDirectory(dirPath: string, raw = false): { [key: string]: ReadableStream | Uint8Array; } {
        const fs = window.require("fs");
        const path = window.require("path");
        const files = fs.readdirSync(dirPath);

        const result = {};

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const filePath = path.join(dirPath, file);
            const stat = fs.statSync(filePath);

            if (stat.isDirectory()) {
                result[file] = this.readDirectory(filePath, raw);
            } else if (stat.isFile()) {
                result[file] = raw ? fs.readFileSync(filePath) : new ReadableStream({
                    start(controller) {
                        controller.enqueue(fs.readFileSync(filePath));
                        controller.close();
                    },
                });
            }
        }

        return result;
    },
    createPathFromTree(tree: {}, currentPath = "") {
        let paths = {};

        for (const key in tree) {
            // eslint-disable-next-line no-prototype-builtins
            if (tree.hasOwnProperty(key)) {
                const newPath = currentPath
                    ? currentPath + "/" + key
                    : key;

                if (
                    typeof tree[key] === "object" &&
                    tree[key] !== null &&
                    !(tree[key] instanceof ReadableStream)
                ) {
                    const nestedPaths = this.createPathFromTree(
                        tree[key],
                        newPath
                    );
                    // paths = paths.concat(nestedPaths);
                    paths = Object.assign({}, paths, nestedPaths);
                } else {
                    // paths.push(newPath);
                    paths[newPath] = tree[key];
                }
            }
        }

        return paths;
    },
    completeFileSystem() {
        return this.createPathFromTree(this.readDirectory("/"));
    },
    removeDirectoryRecursive(directoryPath) {
        const fs = window.require("fs");
        const path = window.require("path");
        const files = fs.readdirSync(directoryPath);
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const currentPath = path.join(directoryPath, file);

            if (fs.lstatSync(currentPath).isDirectory()) {
                this.removeDirectoryRecursive(currentPath);
            } else {
                fs.unlinkSync(currentPath);
            }
        }
        if (directoryPath === "/") return;
        fs.rmdirSync(directoryPath);
    },
    formatFs() {
        const filesystem = this.createPathFromTree(
            this.readDirectory("/")
        );
        const fs = window.require("fs");
        for (const key in filesystem) {
            if (Object.hasOwnProperty.call(filesystem, key)) {
                fs.unlinkSync("/" + key);
            }
        }
        // const directories = fs.readdirSync("/");
        // for (let i = 0; i < directories.length; i++) {
        //     const element = directories[i];
        //     fs.rmdirSync("/" + element);
        // }
        this.removeDirectoryRecursive("/");
    },
    mkdirSyncRecursive(directory: string, mode: any = undefined) {
        if (directory === "") return;
        const fs = window.require("fs");
        if (fs.existsSync(directory)) return;
        const path = window.require("path");
        const parentDir = path.dirname(directory);
        if (!fs.existsSync(parentDir)) {
            this.mkdirSyncRecursive(parentDir, mode);
        }
        fs.mkdirSync(directory, mode);
    },
    toBuffer(buffer: ArrayBuffer, byteOffset = 0, byteLength = buffer.byteLength - byteOffset) {
        return new Uint8Array(buffer, byteOffset, byteLength);
    },
    async importFile(targetPath: string, autoGuessName: boolean = false, bulk = false, filter: string | undefined = undefined) {
        const fileOrFiles = await openFileSelect(filter, bulk);
        const files = Array.isArray(fileOrFiles) ? (fileOrFiles as File[]) : [fileOrFiles as File];
        const fs = window.require("fs");
        const path = window.require("path");
        for (const file of files) {
            let filePath = targetPath;
            console.log("Importing file", filePath);
            if (autoGuessName) {
                if (!targetPath.endsWith("/")) {
                    filePath += "/";
                }
                filePath += file.name;
            }
            console.log("Resolved path:", filePath);
            fs.writeFile(
                filePath,
                // window.BrowserFS.BFSRequire("buffer").Buffer.from(
                // window.Buffer.from(
                FSUtils.toBuffer(
                    await file.arrayBuffer()
                ),
                err => {
                    if (err)
                        console.error("Error during import", err);
                    console.log("Success");
                }
            );
        }
    },
    exportFile(targetPath: string) {
        return new Promise((resolve, reject) => {
            const fs = window.require("fs");
            const path = window.require("path");
            fs.readFile(
                targetPath,
                (err: Error, data: string | Uint8Array) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    const file = new Blob([data]);
                    const blobUrl = URL.createObjectURL(file);
                    const newA = document.createElement("a");
                    newA.href = blobUrl;
                    newA.download = path.parse(targetPath).base;
                    newA.click();
                    newA.remove();
                    URL.revokeObjectURL(blobUrl);
                },
            );
        });
    },
    getDirectorySize(directoryPath: string) {
        const fs = window.require("fs");
        const path = window.require("path");
        let totalSize = 0;

        function traverseDirectory(dirPath) {
            const files = fs.readdirSync(dirPath);

            files.forEach(file => {
                const filePath = path.join(dirPath, file);
                const stats = fs.statSync(filePath);

                if (stats.isDirectory()) {
                    traverseDirectory(filePath);
                } else {
                    totalSize += stats.size;
                }
            });
        }

        traverseDirectory(directoryPath);

        return totalSize;
    }
};

export async function unzipFile(file: File) {
    const files: fflate.UnzipFile[] = [];
    const unZipper = new fflate.Unzip();
    unZipper.register(fflate.UnzipInflate);
    unZipper.onfile = f => {
        files.push(f);
    };
    const reader = file.stream().getReader();
    const read = async () => {
        await reader.read().then(async res => {
            if (!res.done) {
                unZipper.push(res.value, res.done);
                await read();
            } else {
                unZipper.push(new Uint8Array(0), true);
            }
        });
    };
    await read();
    return files;
}

export function arrayToObject<T>(array: T[]) {
    const object: { [key: number]: T; } = array.reduce((obj, element, index) => {
        obj[index] = element;
        return obj;
    }, {});
    return object;
}

export const ZIPUtils = {
    async exportZip() {
        // if (!window.zip) {
        //     injectZipToWindow();
        // }
        // const { BlobWriter, ZipWriter } = window.zip;
        // const zipFileWriter = new BlobWriter();
        // const zipWriter = new ZipWriter(zipFileWriter);
        // await zipWriter.add("hello.txt", helloWorldReader);
        const fileSystem = FSUtils.readDirectory("/", true) as { [key: string]: Uint8Array; };
        // for (const key in fileSystem) {
        //     if (Object.hasOwnProperty.call(fileSystem, key)) {
        //         const element = fileSystem[key];
        //         // await zipWriter.add(key, element);
        //     }
        // }
        // const data = await zipWriter.close();
        // console.log(data);
        const data = fflate.zipSync(fileSystem);
        return new Blob([data], { type: "application/zip" });
    },
    async importZip() {
        const fs = window.require("fs");
        const path = window.require("path");
        // const { BlobReader, ZipReader, BlobWriter } = window.zip;
        // const zipFileReader = new BlobReader(await openFileSelect());
        // await zipWriter.add("hello.txt", helloWorldReader);
        // const zipReader = new ZipReader(zipFileReader);
        const fileSelected = await openFileSelect() as File;
        const zip1 = await unzipFile(fileSelected);
        FSUtils.formatFs();
        for (let i = 0; i < zip1.length; i++) {
            const element = zip1[i];
            console.log(element.name);
            const fullReadPromise = new Promise<Uint8Array[]>((resolve, reject) => {
                const out: Uint8Array[] = [];
                element.ondata = (err, data, final) => {
                    if (err) {
                        console.error("Failed at", element.name, err);
                        return;
                    }
                    out.push(data);
                    if (final === true)
                        resolve(out);
                };
            });
            element.start();
            const out = await fullReadPromise;

            const isDir = element.name.endsWith("/") && out[0].length === 0;
            FSUtils.mkdirSyncRecursive("/" + (isDir ? element.name : path.dirname(element.name)));
            if (isDir) continue;

            console.log("Writing", out);
            fs.writeFile(
                "/" + element.name,
                // window.BrowserFS.BFSRequire("buffer").Buffer.concat(
                window.Buffer.concat(
                    out,
                ),
                () => { }
            );
        }
        return console.log("ZIP import finished");
        // return;
        /*
        const zip = fflate.unzipSync(new Uint8Array(await (await openFileSelect() as File).arrayBuffer()));
        const entries = Object.keys(zip);
        // debugger;
        for (let i = 0; i < entries.length; i++) {
            const element = entries[i];
            // const dir = element.endsWith("/")
            //     ? element
            //     : path.dirname(element);
            // const modElement =
            //     dir === element
            //         ? dir.endsWith("/")
            //             ? dir.slice(0, 1)
            //             : dir
            //         : dir;
            // const modElement: { dir: string, base: string; } = path.parse(element);
            const out = zip[element];
            const isDir = element.endsWith("/") && out.length === 0;
            FSUtils.mkdirSyncRecursive("/" + (isDir ? element : path.dirname(element)));
            // const writer = new BlobWriter();
            // const out = await element.getData(writer);
            // console.log(out);
            // debugger;
            // if (element.directory) continue;
            if (isDir) continue;
            fs.writeFile(
                "/" + element,
                window.BrowserFS.BFSRequire("buffer").Buffer.from(
                    out,
                ),
                () => { }
            );
        }
        // const data = await zipReader.close();
        // console.log(data);
        // return data;
        */
    },
    async downloadZip() {
        const zipFile = await this.exportZip();
        const blobUrl = URL.createObjectURL(zipFile);
        const newA = document.createElement("a");
        newA.href = blobUrl;
        newA.download = "filesystem-dump.zip";
        newA.click();
        newA.remove();
        URL.revokeObjectURL(blobUrl);
    }
};

export function patchMkdirSync(fs) {
    const orig_mkdirSync = fs.mkdirSync;

    fs.mkdirSync = function mkdirSync(path: string, options: any = {}) {
        if (typeof options === "object" && options.recursive) {
            return FSUtils.mkdirSyncRecursive(path, options.mode);
        }
        return orig_mkdirSync(path, typeof options === "object" ? options.mode : options);
    };
    return fs;
}

export function patchReadFileSync(fs) {
    const orig_readFileSync = fs.readFileSync;

    fs.readFileSync = function readFileSync(path: string, optionsOrEncoding: any) {
        if (optionsOrEncoding === "")
            optionsOrEncoding = { encoding: null };
        return orig_readFileSync(path, optionsOrEncoding);
    };
    return fs;
}

export function aquireNative() {
    return Object.values(VencordNative.pluginHelpers)
        .find(m => m.bdCompatLayerUniqueId) as PluginNative<typeof import("./native")>;
}

export const ObjectMerger = {
    customizer(objValue, srcValue, key, object, source) {
        if (srcValue === object) return objValue;
        if (Array.isArray(srcValue)) {
            return lodash.cloneDeep(srcValue);
        }
        return undefined;
    },

    skip(obj: null | object | Array<any>) {
        if (typeof (obj) !== "object") return true;
        if (obj === null) return true;
        if (Array.isArray(obj)) return true;
        return false;
    },

    perform(t: {}, ...exts: object[]) {
        return exts.reduce((result, extender) => {
            if (this.skip(extender)) return result;
            return lodash.mergeWith(result, extender, this.customizer);
        }, t);
    }
};

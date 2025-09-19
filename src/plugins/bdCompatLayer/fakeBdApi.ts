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

/* eslint-disable eqeqeq */
import { Settings } from "@api/Settings";
const VenComponents = OptionComponentMap;

import { OptionComponentMap } from "@components/settings/tabs/plugins/components";
import { ModalAPI } from "@utils/modal";
import { OptionType, PluginOptionBase, PluginOptionComponent, PluginOptionSelect, PluginOptionSlider } from "@utils/types";
import { Forms, lodash, Text } from "@webpack/common";

import { PLUGIN_NAME } from "./constants";
import { fetchWithCorsProxyFallback } from "./fakeStuff";
import { AssembledBetterDiscordPlugin } from "./pluginConstructor";
import { getModule as BdApi_getModule, monkeyPatch as BdApi_monkeyPatch, Patcher, ReactUtils_filler } from "./stuffFromBD";
import { addLogger, compat_logger, createTextForm, docCreateElement, ObjectMerger } from "./utils";

class PatcherWrapper {
    #label;
    constructor(label) {
        this.#label = label;
    }
    get before() {
        return (...args) => {
            return Patcher.before(this.#label, ...args);
        };
    }
    get instead() {
        return (...args) => {
            return Patcher.instead(this.#label, ...args);
        };
    }
    get after() {
        return (...args) => {
            return Patcher.after(this.#label, ...args);
        };
    }
    get getPatchesByCaller() {
        return () => {
            return Patcher.getPatchesByCaller(this.#label);
        };
    }
    get unpatchAll() {
        return () => {
            return Patcher.unpatchAll(this.#label);
        };
    }
}

export const PluginsHolder = {
    getAll: () => {
        const queuedPlugins = window.BdCompatLayer.queuedPlugins as unknown[];
        return [...window.GeneratedPlugins, ...queuedPlugins] as AssembledBetterDiscordPlugin[];
    },
    isEnabled: name => {
        return Vencord.Plugins.isPluginEnabled(name);
    },
    get: function (name) {
        return this.getAll().filter(x => x.name == name)[0] ?? this.getAll().filter(x => x.originalName == name)[0];
    },
    reload: name => {
        Vencord.Plugins.stopPlugin(Vencord.Plugins.plugins[name]);
        Vencord.Plugins.startPlugin(Vencord.Plugins.plugins[name]);
    },
    // rootFolder: "/BD",
    // folder: (function () { return window.BdApi.Plugins.rootFolder + "/plugins"; })(),
    // folder: "/BD/plugins",
    rootFolder: "/BD",
    get folder() {
        return this.rootFolder + "/plugins";
    },
};

const getOptions = (args: any[], defaultOptions = {}) => {
    const lastArg = args[args.length - 1];
    if (typeof lastArg === "object" && lastArg !== null && !Array.isArray(lastArg)) {
        Object.assign(defaultOptions, args.pop());
    }
    return defaultOptions;
};
export const WebpackHolder = {
    Filters: {
        byDisplayName: name => {
            return module => {
                return module && module.displayName === name;
            };
        },
        get byKeys() {
            return this.byProps.bind(WebpackHolder.Filters); // just in case
        },
        byProps: (...props) => {
            return Vencord.Webpack.filters.byProps(...props);
        },
        byStoreName(name) {
            return module => {
                return (
                    module?._dispatchToken &&
                    module?.getName?.() === name
                );
            };
        },
        // get byStrings() {
        //     return WebpackHolder.getByStrings;
        // }
        // uuhhhh?
        get byStrings() {
            return Vencord.Webpack.filters.byCode;
        },
        bySource(...something) {
            const moduleCache = Vencord.Webpack.wreq.m;

            return (_unused: unknown, module: { id?: number; }) => {
                if (!module?.id) return false;

                let source: string;
                try {
                    source = String(moduleCache[module.id]);
                } catch {
                    return false;
                }

                return something.every(search =>
                    typeof search === "string" ? source.includes(search) : search.test(source)
                );
            };
        },
        byPrototypeKeys(...fields) {
            return x =>
                x.prototype &&
                [...fields.flat()].every(field => field in x.prototype);
        },
    },
    getModule: BdApi_getModule,
    waitForModule(filter) {
        return new Promise((resolve, reject) => {
            Vencord.Webpack.waitFor(filter, module => {
                resolve(module);
            });
        });
    },
    getModuleWithKey(filter) {
        let target, id, key;

        this.getModule(
            (e, m, i) => filter(e, m, i) && (target = m) && (id = i) && true,
            { searchExports: true }
        );

        for (const k in target.exports) {
            if (filter(target.exports[k], target, id)) {
                key = k;
                break;
            }
        }

        return [target.exports, key];
    },
    getByDisplayName(name) {
        return this.getModule(
            this.Filters.byDisplayName(name)
        );
    },
    getAllByProps(...props) {
        const moreOpts = getOptions(props, { first: false });
        return this.getModule(this.Filters.byProps(...props), moreOpts);
    },
    get getAllByKeys() {
        return this.getAllByProps;
    },
    getAllByStrings(...strings: any[]) {
        const moreOpts = getOptions(strings, { first: false });
        return this.getModule(this.Filters.byStrings(...strings), moreOpts);
    },
    getByProps(...props) {
        return this.getModule(this.Filters.byProps(...props), {});
    },
    get getByKeys() {
        return WebpackHolder.getByProps.bind(WebpackHolder);
    },
    getModules(...etc) {
        const [first, ...rest] = etc;
        return this.getModule(first, { ...Object.assign({}, ...rest), first: false });
    },
    getByPrototypes(...fields) {
        const moreOpts = getOptions(fields);
        return WebpackHolder.getModule(WebpackHolder.Filters.byPrototypeKeys(fields), moreOpts);
    },
    get getByPrototypeKeys() {
        return this.getByPrototypes;
    },
    getByStringsOptimal(...strings) {
        return module => {
            if (!module?.toString || typeof (module?.toString) !== "function") return; // Not stringable
            let moduleString = "";
            try { moduleString = module?.toString([]); }
            catch (err) { moduleString = module?.toString(); }
            if (!moduleString) return false; // Could not create string
            for (const s of strings) {
                if (!moduleString.includes(s)) return false;
            }
            return true;
        };
    },
    getByStrings(...strings) {
        const moreOpts = getOptions(strings);
        return WebpackHolder.getModule(WebpackHolder.Filters.byStrings(...strings.flat()), moreOpts);
    },
    getBySource(...strings) {
        const moreOpts = getOptions(strings);
        return this.getModule(this.Filters.bySource(...strings), moreOpts);
    },
    findByUniqueProperties(props, first = true) {
        return first
            ? this.getByProps(...props)
            : this.getAllByProps(...props);
    },
    getStore(name) {
        return WebpackHolder.getModule(WebpackHolder.Filters.byStoreName(name));
    },
    // require: (() => {
    //     return Vencord.Webpack.wreq;
    // })(),
    get require() {
        return Vencord.Webpack.wreq;
    },
    get modules() {
        // this function is really really wrong
        // const { cache } = Vencord.Webpack;
        // const result = {};

        // for (const key in cache) {
        //     if (
        //         // eslint-disable-next-line no-prototype-builtins
        //         cache.hasOwnProperty(key) &&
        //         // eslint-disable-next-line no-prototype-builtins
        //         cache[key].hasOwnProperty("exports")
        //     ) {
        //         result[key] = cache[key].exports;
        //     }
        // }
        // return result;
        return Vencord.Webpack.wreq.m;
    },
    get getMangled() {
        return Vencord.Webpack.mapMangledModule;
    },
    getWithKey(filter, options: { target?: any; } = {}) {
        const { target: opt_target = null, ...unrelated } = options;
        const cache = {
            target: opt_target,
            key: undefined as undefined | string,
        };
        let iterationCount = 0;
        const keys = ["0", "1", "length"];
        return new Proxy<never[]>([], {
            get(_, prop) {
                if (typeof prop === "symbol") {
                    if (prop === Symbol.iterator) {
                        return function* (this: ProxyHandler<never[]>) {
                            yield this.get!(_, "0", undefined);
                            yield this.get!(_, "1", undefined);
                        }.bind(this);
                    }
                    if (prop === Symbol.toStringTag) return "Array";
                    return Reflect.get(Array.prototype, prop, _);
                }
                if (prop === "next") { // not sure about this one
                    return () => {
                        if (iterationCount === 0) {
                            iterationCount++;
                            return { value: this.get!(_, "0", undefined), done: false };
                        } else if (iterationCount === 1) {
                            iterationCount++;
                            return { value: this.get!(_, "1", undefined), done: false };
                        } else {
                            return { value: undefined, done: true };
                        }
                    };
                }

                switch (prop) {
                    case "0":
                        if (cache.target === null) {
                            cache.target = WebpackHolder.getModule(
                                mod => Object.values(mod).some(filter),
                                unrelated,
                            );
                        }
                        return cache.target;

                    case "1":
                        if (cache.target === null) {
                            this.get!(_, "0", undefined);
                        }
                        if (cache.key === undefined && cache.target !== null) {
                            cache.key = cache.target
                                ? Object.keys(cache.target).find(k => filter(cache.target[k]))
                                : undefined;
                        }
                        return cache.key;

                    case "length":
                        return 2;

                    default:
                        return undefined;
                }
            },

            has(_, prop) {
                return keys.includes(prop.toString());
            },

            getOwnPropertyDescriptor(_, prop) {
                if (keys.includes(prop.toString())) {
                    return {
                        value: this.get!(_, prop, undefined),
                        enumerable: prop.toString() !== "length",
                        configurable: true,
                        writable: false,
                    };
                }
                return undefined;
            },

            ownKeys() {
                return keys;
            },
        });
    },
};

export const DataHolder = {
    pluginData: {},
    latestDataCheck(key) {
        if (typeof this.pluginData[key] !== "undefined") return;
        if (
            !window
                .require("fs")
                .existsSync(
                    PluginsHolder.folder +
                    "/" +
                    key +
                    ".config.json"
                )
        ) {
            this.pluginData[key] = {};
            return;
        }
        this.pluginData[key] = JSON.parse(
            window
                .require("fs")
                .readFileSync(
                    PluginsHolder.folder +
                    "/" +
                    key +
                    ".config.json"
                )
        );
    },
    load(key, value) {
        // if (!this.pluginData[key]) {
        //     if (!window.require("fs").existsSync(BdApiReimpl.Plugins.folder + "/" + key + ".config.json"))
        //         this.pluginData[key] = {};
        //     this.pluginData[key] = JSON.parse(window.require("fs").readFileSync(BdApiReimpl.Plugins.folder + "/" + key + ".config.json"));
        // }
        if (!value || !key) return;
        this.latestDataCheck(key);
        return this.pluginData[key][value];
    },
    save(key, value, data) {
        if (!value || !key || !data) return;
        this.latestDataCheck(key);
        this.pluginData[key][value] = data;
        window
            .require("fs")
            .writeFileSync(
                PluginsHolder.folder + "/" + key + ".config.json",
                JSON.stringify(this.pluginData[key], null, 4)
            );
    }
};

class DataWrapper {
    #label;
    constructor(label) {
        this.#label = label;
    }
    get load() {
        return value => {
            return DataHolder.load(this.#label, value);
        };
    }
    get save() {
        return (key, data) => {
            return DataHolder.save(this.#label, key, data);
        };
    }
}

type SettingsType = {
    type: string,
    id: string,
    name: string,
    note?: string,
    settings?: SettingsType[],
    collapsible?: boolean,
    shown?: boolean,
    value?: any,
    options?: { label: string, value: number; }[],
    markers?: (number | { label: string, value: number })[],
};

const _ReactDOM_With_createRoot = {} as typeof Vencord.Webpack.Common.ReactDOM & { createRoot: typeof Vencord.Webpack.Common.createRoot; };

export const UIHolder = {
    alert(title: string, content: any) {
        return this.showConfirmationModal(title, content, { cancelText: null });
    },
    helper() {
        compat_logger.error(new Error("Not implemented."));
    },
    showToast(message, toastType = 1) {
        const { createToast, showToast } = getGlobalApi().Webpack.getModule(x => x.createToast && x.showToast);
        showToast(createToast(message || "Success !", [0, 1, 2, 3, 4, 5].includes(toastType) ? toastType : 1)); // showToast has more then 3 toast types?
        // uhmm.. aschtually waht is 4.
    },
    showConfirmationModal(title: string, content: any, settings: any = {}) {
        // The stolen code from my beloved davyy has been removed. :(
        const Colors = {
            BRAND: getGlobalApi().findModuleByProps("colorBrand").colorBrand
        };
        const ConfirmationModal = getGlobalApi().Webpack.getModule(x => x.ConfirmModal).ConfirmModal;
        const { openModal } = ModalAPI;
        // const { openModal } = getGlobalApi().Webpack.getModule(x => x.closeModal && x.openModal && x.hasModalOpen);

        const {
            confirmText = settings.confirmText || "Confirm",
            cancelText = settings.cancelText || "Cancel",
            onConfirm = settings.onConfirm || (() => { }),
            onCancel = settings.onCancel || (() => { }),
            extraReact = settings.extraReact || [],
        } = settings;

        const moreReact: React.ReactElement[] = [];

        const whiteTextStyle = {
            color: "white",
        };

        const { React } = getGlobalApi();
        const whiteTextContent = React.createElement("div", { style: whiteTextStyle }, content);

        moreReact.push(whiteTextContent);
        // moreReact.push(...extraReact) // IM ADDING MORE DIV POSSIBILITESS !!!!

        // I dont know how anyone would find this useful but screw it yeah?
        // Someone will find it useful one day
        /*
        USAGE:::
        const extra1 = BdApi.React.createElement("div", {}, "Extra 1");
        const extra2 = BdApi.React.createElement("div", {}, "Extra 2");

        const extraReact = [extra1, extra2];

        BdApi.UI.showConfirmationModal(
        "Modal title",
        "Modal content",
        {
            extraReact: extraReact
        }
        );
        */
        extraReact.forEach(reactElement => {
            moreReact.push(reactElement);
        });

        openModal(props => React.createElement(ConfirmationModal, Object.assign({
            header: title,
            confirmButtonColor: Colors.BRAND,
            confirmText: confirmText,
            cancelText: cancelText,
            onConfirm: onConfirm,
            onCancel: onCancel,
            children: moreReact,
            ...props
        })));
    },
    showNotice_(title, content, options: any = {}) {
        // const { React, ReactDOM } = BdApiReImplementation;
        const container = document.createElement("div");
        container.className = "custom-notification-container";

        const closeNotification = () => {
            const customNotification = container.querySelector(".custom-notification");
            if (customNotification) {
                customNotification.classList.add("close");
                setTimeout(() => {
                    // ReactDOM.unmountComponentAtNode(container);
                    document.body.removeChild(container);
                }, 1000);
            }
        };

        const { timeout = 0, type = "default" } = options;
        const buttons = [
            { label: "Close", onClick: x => { x(); } },
            ...options.buttons || []
        ];

        const buttonElements = buttons.map((button, index) => {
            const onClickHandler = () => {
                button.onClick(closeNotification);
                // closeNotification();
            };

            // return React.createElement(
            //     "button",
            //     { key: index, className: "confirm-button", onClick: onClickHandler },
            //     button.label
            // );
            // const t = document.createElement("button");
            // t.setAttribute("key", index);
            // t.className = "confirm-button";
            // t.onclick = onClickHandler;
            // // t.onClick = t.onclick;
            // t.append(button.label);
            // return t;
            return docCreateElement("button", { className: "confirm-button", onclick: onClickHandler }, [typeof button.label === "string" ? docCreateElement("span", { innerText: button.label }) : button.label]);
        });
        // const xButton = React.createElement(
        //     "button",
        //     { onClick: closeNotification, className: "button-with-svg" },
        //     React.createElement(
        //         "svg",
        //         { width: "24", height: "24", className: "xxx" },
        //         React.createElement("path", {
        //             d:
        //                 "M18.4 4L12 10.4L5.6 4L4 5.6L10.4 12L4 18.4L5.6 20L12 13.6L18.4 20L20 18.4L13.6 12L20 5.6L18.4 4Z",
        //             stroke: "white",
        //             strokeWidth: "2",
        //             fill: "none",
        //         })
        //     )
        // );
        const xButton = docCreateElement("button", { onclick: closeNotification, className: "button-with-svg" }, [
            docCreateElement("svg", { className: "xxx" }, [
                docCreateElement("path", undefined, undefined, {
                    stroke: "white",
                    strokeWidth: "2",
                    fill: "none",
                    d:
                        "M18.4 4L12 10.4L5.6 4L4 5.6L10.4 12L4 18.4L5.6 20L12 13.6L18.4 20L20 18.4L13.6 12L20 5.6L18.4 4Z",
                }),
            ], { style: "width: 24px; height: 24px;" }),
        ]);
        // const titleComponent = typeof title === "string" ? (
        //     React.createElement("div", { className: "notification-title" }, title, xButton)
        // ) : (
        //     React.createElement(
        //         title.tagName.toLowerCase(),
        //         { className: "notification-title" },
        //         title.textContent || " ",
        //         xButton
        //     )
        // );
        // const titleComponent = docCreateElement("span", { className: "notification-title" }, [typeof title === "string" ? docCreateElement("span", { innerText: title }) : title, xButton]);
        const titleComponent = docCreateElement("span", { className: "notification-title" }, [typeof title === "string" ? docCreateElement("span", { innerText: title }) : title]);
        // const contentComponent = typeof content === "string" ? (
        //     React.createElement("div", { className: "content" }, content)
        // ) : (
        //     React.isValidElement(content) ? content : React.createElement("div", { className: "content" }, " ") // Very nice looking fallback. I dont know why I dont optimize code along the way.
        // );
        const contentComponent = docCreateElement("div", { className: "content" }, [typeof content === "string" ? docCreateElement("span", { innerText: title }) : content]);

        // const customNotification = React.createElement(
        //     "div",
        //     { className: `custom-notification ${type}` },
        //     React.createElement("div", { className: "top-box" }, titleComponent),
        //     contentComponent,
        //     React.createElement("div", { className: "bottom-box" }, buttonElements)
        // );
        const customNotification = docCreateElement("div", { className: `custom-notification ${type}` }, [
            docCreateElement("div", { className: "top-box" }, [titleComponent]),
            contentComponent,
            docCreateElement("div", { className: "bottom-box" }, buttonElements),
        ]);

        // ReactDOM.render(customNotification, container);
        container.appendChild(customNotification);
        document.body.appendChild(container);

        if (timeout > 0) {
            setTimeout(closeNotification, timeout);
        }
        return closeNotification;
    },
    showNotice(content, options) {
        return this.showNotice_("Notice", content, options);
    },
    createTooltip(attachTo, content, opts) {
        return { // yeah... no. atleast not right now (it's midnight)
            label: "",
            show() {
                compat_logger.warn("Remind davil to implement tooltip grrr!");
                return null;
            },
            hide() {
                return this.show();
            }
        };
    },
    showChangelogModal() {
        // yeah... no. atleast not right now (it's midnight again lol)
        compat_logger.warn("Remind davil to implement changelog modal grrr!");
    },
    buildSettingsPanel(options: { settings: SettingsType[], onChange: CallableFunction; }) {
        const settings: React.ReactNode[] = [];
        const { React } = getGlobalApi();
        const defaultCatId = "null";
        const targetSettingsToSet = { enabled: true, [defaultCatId]: { enabled: true, } };
        for (let i = 0; i < options.settings.length; i++) {
            const current = options.settings[i];
            if (current.type === "category" && current.settings) {
                targetSettingsToSet[current.id] = { enabled: true, };
                // let's hope no one makes category in category
                for (let j = 0; j < current.settings.length; j++) {
                    const currentInCategory = current.settings[j];
                    Object.defineProperty(targetSettingsToSet[current.id], currentInCategory.id, {
                        get() {
                            if (typeof currentInCategory.value === "function")
                                return currentInCategory.value();
                            else
                                return currentInCategory.value;
                        },
                        set(val) {
                            options.onChange(current.id, currentInCategory.id, val); // first is category id, setting id and then new value
                        }
                    });
                }
            }
            else {
                Object.defineProperty(targetSettingsToSet[defaultCatId], current.id, {
                    get() {
                        if (typeof current.value === "function")
                            return current.value();
                        else
                            return current.value;
                    },
                    set(val) {
                        options.onChange(null, current.id, val);
                    }
                });
            }
        }
        const craftOptions = (now: SettingsType[], catName: string) => {
            const tempResult: React.ReactNode[] = [];
            for (let i = 0; i < now.length; i++) {
                const current = now[i];
                const fakeOption: PluginOptionBase & { type: number; } = {
                    description: "",
                    type: 0,
                };
                switch (current.type) {
                    // case "category": {
                    //     fakeOption.type = OptionType.COMPONENT;
                    //     (fakeOption as PluginOptionComponent).component = () => { return React.createElement(Text, { variant: "heading-lg/semibold" }, current.name); };
                    //     break;
                    // }
                    case "number": {
                        fakeOption.type = OptionType.NUMBER;
                        fakeOption.description = current.note!;
                        break;
                    }
                    case "switch": {
                        fakeOption.type = OptionType.BOOLEAN;
                        fakeOption.description = current.note!;
                        break;
                    }
                    case "text": {
                        fakeOption.type = OptionType.STRING;
                        fakeOption.description = current.note!;
                        break;
                    }
                    case "dropdown": {
                        fakeOption.type = OptionType.SELECT;
                        fakeOption.description = current.note!;
                        const fakeOptionAsSelect = fakeOption as PluginOptionSelect;
                        fakeOptionAsSelect.options = current.options!;
                        break;
                    }
                    case "slider": {
                        fakeOption.type = OptionType.SLIDER;
                        fakeOption.description = current.note!;
                        const fakeOptionAsSlider = fakeOption as PluginOptionSlider;
                        
                        if (current.markers) {
                            if (typeof current.markers[0] === "object") {
                                fakeOptionAsSlider.markers = current.markers.map(x => (x as { label: string, value: number }).value);
                            } else {
                                fakeOptionAsSlider.markers = current.markers as number[];
                            }
                            fakeOptionAsSlider.stickToMarkers = Reflect.get(current, "stickToMarkers");
                        } else if (typeof current["min"] !== "undefined" && typeof current["max"] !== "undefined") {
                            const min = current["min"] as number;
                            const max = current["max"] as number;
                            
                            fakeOptionAsSlider.markers = [min, max];
                            fakeOptionAsSlider.stickToMarkers = false;
                            
                            fakeOptionAsSlider.componentProps = {
                                onValueRender: (v: number) => {
                                    const rounded = parseFloat(v.toFixed(2));
                                    return rounded % 1 === 0 ? String(Math.round(rounded)) : String(rounded);
                                }
                            };
                        }
                        
                        break;
                    }
                    default: {
                        fakeOption.type = OptionType.COMPONENT;
                        (fakeOption as unknown as PluginOptionComponent).component = () => { return React.createElement(React.Fragment, {}, `Remind Davilarek to add setting of type: ${current.type}!\nThis is a placeholder.`); };
                        break;
                    }
                }
                const fakeElement = VenComponents[fakeOption.type] as typeof VenComponents[keyof typeof VenComponents];
                const craftingResult = current.type === "category" ?
                    React.createElement("div", { style: { marginBottom: 8 } },
                        [React.createElement(Forms.FormDivider), React.createElement(Text, { variant: "heading-lg/semibold" }, current.name)]) :
                    React.createElement("div", { className: "bd-compat-setting", style: { marginBottom: 8 } }, [
                        React.createElement(Text, { variant: "heading-md/semibold" }, current.name),
                        React.createElement(fakeElement, {
                            id: current.id,
                            key: current.id,
                            option: fakeOption,
                            onChange(newValue) {
                                targetSettingsToSet[catName][current.id] = newValue;
                            },
                            // onError() { },
                            pluginSettings: targetSettingsToSet[catName],
                        })
                    ]);
                settings.push(craftingResult);
                if (current.type === "category") {
                    craftOptions(current.settings!, current.id);
                }
            }
        };
        craftOptions(options.settings, defaultCatId);
        const result = React.createElement("div", {}, settings);
        return result;
    }
};

export const DOMHolder = {
    addStyle(id, css) {
        id = id.replace(/^[^a-z]+|[^\w-]+/gi, "-");
        const style: HTMLElement =
            document
                .querySelector("bd-styles")
                ?.querySelector(`#${id}`) ||
            this.createElement("style", { id });
        style.textContent = css;
        document.querySelector("bd-styles")?.append(style);
    },
    removeStyle(id) {
        id = id.replace(/^[^a-z]+|[^\w-]+/gi, "-");
        const exists = document
            .querySelector("bd-styles")
            ?.querySelector(`#${id}`);
        if (exists) exists.remove();
    },
    createElement(tag, options: any = {}, child = null) {
        const { className, id, target } = options;
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (id) element.id = id;
        if (child) element.append(child);
        if (target) document.querySelector(target).append(element);
        return element;
    },
    injectScript(targetName: string, url: string) { // who thought this is a good idea?
        targetName = targetName.replace(/^[^a-z]+|[^\w-]+/gi, "-"); // TODO: move this to a function or something
        return new Promise((resolve, reject) => {
            const theRemoteScript = document
                .querySelector("bd-scripts")?.querySelector(`#${targetName}`) || this.createElement("script", { id: targetName });
            theRemoteScript.src = url;
            theRemoteScript.onload = resolve;
            theRemoteScript.onerror = reject;
            document.querySelector("bd-scripts")?.append(theRemoteScript);
        });
    },
    removeScript(targetName: string) {
        targetName = targetName.replace(/^[^a-z]+|[^\w-]+/gi, "-");
        const theRemoteScript = document
            .querySelector("bd-scripts")?.querySelector(`#${targetName}`);
        if (theRemoteScript != null)
            theRemoteScript.remove();
    },
    parseHTML(html: string, asFragment = false) {
        const template = document.createElement("template");
        template.innerHTML = html.trim();
        if (asFragment) {
            return template.content.cloneNode(true);
        }
        const { childNodes } = template.content;
        return childNodes.length === 1 ? childNodes[0] : childNodes;
    },
};

class DOMWrapper {
    #label;
    constructor(label) {
        this.#label = label;
    }
    addStyle(id, css) {
        if (arguments.length === 2) {
            id = arguments[0];
            css = arguments[1];
        }
        else {
            css = id;
            id = this.#label;
        }
        return DOMHolder.addStyle(id, css);
    }
    removeStyle(id) {
        if (arguments.length === 1) {
            id = arguments[0];
        }
        else {
            id = this.#label;
        }
        return DOMHolder.removeStyle(id);
    }
    get createElement() {
        return DOMHolder.createElement;
    }
}

class BdApiReImplementationInstance {
    #targetPlugin;
    #patcher: PatcherWrapper | typeof Patcher;
    #data: DataWrapper | typeof DataHolder;
    #dom: DOMWrapper | typeof DOMHolder;
    ContextMenu = {};
    labelsOfInstancedAPI: { [key: string]: BdApiReImplementationInstance; };
    constructor(label?: string) {
        if (label) {
            if (getGlobalApi().labelsOfInstancedAPI[label]) {
                // @ts-ignore
                this.labelsOfInstancedAPI = undefined;
                // @ts-ignore
                this.#patcher = undefined;
                // @ts-ignore
                this.#data = undefined;
                // @ts-ignore
                this.#dom = undefined;
                // ts shut up please
                return getGlobalApi().labelsOfInstancedAPI[label];
            }
            this.#targetPlugin = label;
            this.#patcher = new PatcherWrapper(label);
            this.#data = new DataWrapper(label);
            this.#dom = new DOMWrapper(label);
            // @ts-ignore
            this.labelsOfInstancedAPI = undefined;
            getGlobalApi().labelsOfInstancedAPI[label] = this;
            Object.defineProperty(this, "ContextMenu", {
                get() {
                    return getGlobalApi().ContextMenu;
                }
            });
        }
        else {
            // window.globalApisCreated = (window.globalApisCreated !== undefined ? window.globalApisCreated + 1 : 0);
            this.#patcher = Patcher;
            this.#data = DataHolder;
            this.#dom = DOMHolder;
            this.labelsOfInstancedAPI = {};
            return getGlobalApi();
        }
    }
    get Patcher() {
        return this.#patcher;
    }
    get Plugins() { return PluginsHolder; }
    Components = {
        get Tooltip() {
            return getGlobalApi().Webpack.getModule(
                x => x && x.prototype && x.prototype.renderTooltip,
                { searchExports: true }
            );
        },
        get Text() {
            return Vencord.Webpack.Common.Text;
        },
        SwitchInput(props: { id: string, value: boolean, onChange: (v: boolean) => void; }) {
            return getGlobalApi().UI.buildSettingsPanel({
                settings: [{
                    id: props.id,
                    name: "",
                    type: "switch",
                    value: props.value,
                }],
                onChange(c, id, v: boolean) {
                    props.onChange(v);
                },
            });
        },
        SettingGroup(props: { id: string, name: string, children: React.ReactNode | React.ReactNode[]; }) {
            return Vencord.Webpack.Common.React.createElement("span", {}, [getGlobalApi().UI.buildSettingsPanel({
                settings: [{
                    id: props.id,
                    name: props.name,
                    type: "category",
                    settings: [],
                }],
                onChange(c, id, v) { },
            })], props.children); // ew
        },
        SettingItem(props: { id: string, name: string, note: string, children: React.ReactNode | React.ReactNode[]; }) {
            // return Vencord.Webpack.Common.React.createElement("div", {
            //     id: `bd_compat-item-${props.id}`,
            // }, [props.name, props.note, props.children]);
            const opt = OptionType.COMPONENT;
            const fakeElement = VenComponents[opt] as typeof VenComponents[keyof typeof VenComponents];
            return Vencord.Webpack.Common.React.createElement("div", undefined, [Vencord.Webpack.Common.React.createElement(fakeElement, {
                id: `bd_compat-item-${props.id}`,
                key: `bd_compat-item-${props.id}`,
                option: {
                    type: opt,
                    component: () => createTextForm(props.name, props.note, false),
                },
                onChange(newValue) { },
                // onError() { },
                pluginSettings: { enabled: true, },
            }), props.children]);
        },
        RadioInput(props: { name: string, onChange: (new_curr: string) => void, value: any, options: { name: string, value: any; }[]; }) {
            return getGlobalApi().UI.buildSettingsPanel({
                settings: [{
                    id: `bd_compat-radio-${props.name}`,
                    name: props.name,
                    type: "dropdown",
                    value: props.value,
                    options: props.options.map(x => ({ label: x.name, value: x.value }))
                }],
                onChange(c, id, v: string) {
                    props.onChange(v);
                },
            });
        },
    };
    get React() {
        return Vencord.Webpack.Common.React;
    }
    get Webpack() {
        return WebpackHolder;
    }
    isSettingEnabled(collection, category, id) {
        return false;
    }
    enableSetting(collection, category, id) { }
    disableSetting(collection, category, id) { }
    get ReactDOM() {
        if (_ReactDOM_With_createRoot.createRoot === undefined)
            Object.assign(_ReactDOM_With_createRoot, { ...Vencord.Webpack.Common.ReactDOM, createRoot: Vencord.Webpack.Common.createRoot });
        return _ReactDOM_With_createRoot;
    }
    get ReactUtils() {
        return {
            get wrapElement() {
                return ReactUtils_filler.wrapElement.bind(ReactUtils_filler);
            },
            getInternalInstance(node: Node & any) {
                return node.__reactFiber$ || node[Object.keys(node).find(k => k.startsWith("__reactInternalInstance") || k.startsWith("__reactFiber")) as string] || null;
            },
            isMatch(fiber: any, isInclusive: boolean, targetList: string[]): boolean {
                const type = fiber?.type;
                const name = type?.displayName || type?.name;
                if (!name) return false;
                return isInclusive === targetList.includes(name);
            },
            // based on https://github.com/BetterDiscord/BetterDiscord/blob/d97802bfa7dd8987aa6a2bda37d8fe801502000d/src/betterdiscord/api/reactutils.ts#L120
            getOwnerInstance(el: HTMLElement, opt = { include: undefined, exclude: ["Popout", "Tooltip", "Scroller", "BackgroundFlash"], filter: (_: any) => true }) {
                const targetList = opt.include ?? opt.exclude;
                const isInclusive = !!opt.include;
                let fiberNode = getGlobalApi().ReactUtils.getInternalInstance(el);
                while (fiberNode?.return) {
                    fiberNode = fiberNode.return;
                    const instance = fiberNode.stateNode;
                    if (instance && typeof instance !== "function" && typeof instance !== "string" && getGlobalApi().ReactUtils.isMatch(fiberNode, isInclusive, targetList) && opt.filter(instance)) {
                        return instance;
                    }
                }
                return null;
            }
        };
    }
    findModuleByProps(...props) {
        return this.findModule(module =>
            props.every(prop => typeof module[prop] !== "undefined")
        );
    }
    findModule(filter) {
        return this.Webpack.getModule(filter);
    }
    findAllModules(filter) {
        return this.Webpack.getModule(filter, { first: false });
    }
    suppressErrors(method, message = "") {
        return (...params) => {
            try {
                return method(...params);
            } catch (err) {
                compat_logger.error(err, `Error occured in ${message}`);
            }
        };
    }
    get monkeyPatch() { return BdApi_monkeyPatch; }
    get Data() {
        return this.#data;
    }
    get loadData() {
        return this.Data.load.bind(this.Data);
    }
    get saveData() {
        return this.Data.save.bind(this.Data);
    }
    get setData() {
        return this.Data.save.bind(this.Data);
    }
    get getData() {
        return this.Data.load.bind(this.Data);
    }
    readonly Utils = {
        findInTree(tree, searchFilter, options = {}) {
            const this_ = getGlobalApi().Utils;
            const { walkable = null, ignore = [] } = options as { walkable: string[], ignore: string[]; };

            function findInObject(obj) {
                for (const key in obj) {
                    if (ignore.includes(key)) continue;
                    const value = obj[key];

                    if (searchFilter(value)) return value;

                    if (typeof value === "object" && value !== null) {
                        const result = findInObject(value);
                        if (result !== undefined) return result;
                    }
                }
                return undefined;
            }

            if (typeof searchFilter === "string") return tree?.[searchFilter];
            if (searchFilter(tree)) return tree;

            if (Array.isArray(tree)) {
                for (const value of tree) {
                    const result = this_.findInTree(value, searchFilter, { walkable, ignore });
                    if (result !== undefined) return result;
                }
            } else if (typeof tree === "object" && tree !== null) {
                const keysToWalk = walkable || Object.keys(tree);
                for (const key of keysToWalk) {
                    if (tree[key] === undefined) continue;
                    const result = this_.findInTree(tree[key], searchFilter, { walkable, ignore });
                    if (result !== undefined) return result;
                }
            }

            return undefined;
        },
        getNestedValue(obj: any, path: string) {
            const properties = path.split(".");
            let current = obj;
            for (const prop of properties) {
                if (current == null) return undefined;
                current = current[prop];
            }
            return current;
        },
        semverCompare(c: string, n: string) { // TODO: fix, this implementation is weak
            const cParts = c.split(".").map(x => Number(x));
            const nParts = n.split(".").map(x => Number(x));
            for (let i = 0; i < 3; i++) {
                const cNum = cParts[i] ?? 0;
                const nNum = nParts[i] ?? 0;
                if (cNum < nNum) return -1;
                if (cNum > nNum) return 1;
            }
            return 0;
        },
        extend: ObjectMerger.perform.bind(ObjectMerger),
        debounce: lodash.debounce,
    };
    get UI() {
        return UIHolder;
    }
    get Net() {
        return {
            fetch: (url: string, options) => { return fetchWithCorsProxyFallback(url, options, Settings.plugins[PLUGIN_NAME].corsProxyUrl); },
        };
    }
    alert(title, content) {
        UIHolder.showConfirmationModal(title, content, { cancelText: null });
    }
    showToast(content, toastType = 1) {
        UIHolder.showToast(content, toastType);
    }
    showNotice(content, settings = {}) {
        UIHolder.showNotice(content, settings);
    }
    showConfirmationModal(title, content, settings = {}) {
        UIHolder.showConfirmationModal(title, content, settings);
    }
    get injectCSS() {
        return DOMHolder.addStyle.bind(DOMHolder);
    }
    get clearCSS() {
        return DOMHolder.removeStyle.bind(DOMHolder);
    }
    get DOM() {
        return this.#dom;
    }
    get Logger() {
        return addLogger();
    }
    get linkJS() {
        return DOMHolder.injectScript.bind(DOMHolder);
    }
    get unlinkJS() {
        return DOMHolder.removeScript.bind(DOMHolder);
    }
}

function assignToGlobal() {
    const letsHopeThisObjectWillBeTheOnlyGlobalBdApiInstance = new BdApiReImplementationInstance();
    const gettersToSet = ["Components", "ContextMenu", "DOM", "Data", "Patcher", "Plugins", "React", "ReactDOM", "ReactUtils", "UI", "Net", "Utils", "Webpack", "labelsOfInstancedAPI", "alert", "disableSetting", "enableSetting", "findModule", "findModuleByProps", "findAllModules", "getData", "isSettingEnabled", "loadData", "monkeyPatch", "saveData", "setData", "showConfirmationModal", "showNotice", "showToast", "suppressErrors", "injectCSS", "Logger", "linkJS", "unlinkJS", "clearCSS"];
    const settersToSet = ["ContextMenu"];
    for (let index = 0; index < gettersToSet.length; index++) {
        const element = gettersToSet[index];
        let setter = undefined as ((v: any) => any) | undefined;
        if (settersToSet.indexOf(element) !== -1) {
            setter = (v => letsHopeThisObjectWillBeTheOnlyGlobalBdApiInstance[element] = v);
        }
        Object.defineProperty(BdApiReImplementationInstance, element, {
            get: () => letsHopeThisObjectWillBeTheOnlyGlobalBdApiInstance[element],
            set: setter,
            configurable: true,
        });
    }
}
export function cleanupGlobal() {
    const gettersToSet = ["Components", "ContextMenu", "DOM", "Data", "Patcher", "Plugins", "React", "ReactDOM", "ReactUtils", "UI", "Net", "Utils", "Webpack", "labelsOfInstancedAPI", "alert", "disableSetting", "enableSetting", "findModule", "findModuleByProps", "findAllModules", "getData", "isSettingEnabled", "loadData", "monkeyPatch", "saveData", "setData", "showConfirmationModal", "showNotice", "showToast", "suppressErrors", "injectCSS", "Logger", "linkJS", "unlinkJS", "clearCSS"];
    for (let index = 0; index < gettersToSet.length; index++) {
        const element = gettersToSet[index];
        delete getGlobalApi()[element];
    }
}
type BdApiReImplementationGlobal = typeof BdApiReImplementationInstance & BdApiReImplementationInstance;

// class BdApi_ {
//     instance: BdApiReImplementationInstance;
//     constructor(label) {
//         // return new BdApiReImplementationInstance(label);
//         this.instance = new BdApiReImplementationInstance(label);
//         return this.instance;
//     }
//     static get Patcher() {
//         return this.instance;
//     }
// }
// it's late night

export function createGlobalBdApi() {
    assignToGlobal();
    return BdApiReImplementationInstance as BdApiReImplementationGlobal;
    // return new BdApiReImplementationInstance();
    // const mod = BdApiReImplementationInstance;
    // // mod.internalInstance = new BdApiReImplementationInstance();
    // Object.defineProperty(mod, "internalInstance", {
    //     value: new BdApiReImplementationInstance()
    // });
    // const modProxy = new Proxy(mod, {
    //     get(target, prop) {
    //         // @ts-ignore
    //         if (target.internalInstance[prop]) {
    //             // @ts-ignore
    //             return target.internalInstance[prop];
    //         }
    //         // console.log("prop", prop);
    //         if (prop == "prototype")
    //             return BdApiReImplementationInstance;
    //         return undefined;
    //     },
    //     set(target, p, newValue) {
    //         // @ts-ignore
    //         target.internalInstance[p] = newValue;
    //         return true;
    //     },
    // });
    // return modProxy;
}

export function getGlobalApi() {
    return window.BdApi as BdApiReImplementationGlobal;
}

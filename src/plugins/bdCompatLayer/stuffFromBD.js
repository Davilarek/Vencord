/* eslint-disable simple-header/header */
/* eslint-disable eqeqeq */
/* eslint-disable no-prototype-builtins */
/* globals BdApi window document Vencord */
/* eslint no-undef:error */
/**
 * This file contains code taken from https://github.com/BetterDiscord/BetterDiscord
 * @see https://github.com/BetterDiscord/BetterDiscord/blob/main/LICENSE
 */
!function () { };
import { addLogger } from "./utils";
const Logger = addLogger();

/**
 * @summary Code taken from BetterDiscord (sourced from commit: cb08178b7702fe2612343f279c007eb2a638a113)
 * @description Changes:
 *
 *  Formatting changed
 */
function monkeyPatch(what, methodName, options) {
    const { before, after, instead, once = false, callerId = "BdApi" } = options;
    const patchType = before ? "before" : after ? "after" : instead ? "instead" : "";
    if (!patchType) return Logger.err("BdApi", "Must provide one of: after, before, instead");
    const originalMethod = what[methodName];
    const data = {
        originalMethod: originalMethod,
        callOriginalMethod: () => data.originalMethod.apply(data.thisObject, data.methodArguments)
    };
    data.cancelPatch = Patcher[patchType](callerId, what, methodName, (thisObject, args, returnValue) => {
        data.thisObject = thisObject;
        data.methodArguments = args;
        data.returnValue = returnValue;
        try {
            const patchReturn = Reflect.apply(options[patchType], null, [data]);
            if (once) data.cancelPatch();
            return patchReturn;
        }
        catch (err) {
            Logger.stacktrace(`${callerId}:monkeyPatch`, `Error in the ${patchType} of ${methodName}`, err);
        }
    });
    return data.cancelPatch;
}

/**
 * @summary Code taken from BetterDiscord (sourced from commit: cb08178b7702fe2612343f279c007eb2a638a113)
 * @description Changes:
 *
 *  Occurrences of "DiscordModules" replaced with "this.DiscordModules"
 *
 *  Occurrences of "WebpackModules" replaced with "BdApi.Webpack"
 *
 *  Added static method "setup"
 *
 *  Formatting changed
 */
class Patcher {
    static setup(DiscordModules) {
        this.DiscordModules = DiscordModules;
    }

    static get patches() { return this._patches || (this._patches = []); }

    /**
     * Returns all the patches done by a specific caller
     * @param {string} name - Name of the patch caller
     * @method
     */
    static getPatchesByCaller(name) {
        if (!name) return [];
        const patches = [];
        for (const patch of this.patches) {
            for (const childPatch of patch.children) {
                if (childPatch.caller === name) patches.push(childPatch);
            }
        }
        return patches;
    }

    /**
     * Unpatches all patches passed, or when a string is passed unpatches all
     * patches done by that specific caller.
     * @param {Array|string} patches - Either an array of patches to unpatch or a caller name
     */
    static unpatchAll(patches) {
        if (typeof patches === "string") patches = this.getPatchesByCaller(patches);

        for (const patch of patches) {
            patch.unpatch();
        }
    }

    static resolveModule(module) {
        if (!module || typeof (module) === "function" || (typeof (module) === "object" && !Array.isArray(module))) return module;
        if (typeof module === "string") return this.DiscordModules[module];
        if (Array.isArray(module)) return BdApi.Webpack.findByUniqueProperties(module);
        return null;
    }

    static makeOverride(patch) {
        return function () {
            let returnValue;
            if (!patch.children || !patch.children.length) return patch.originalFunction.apply(this, arguments);
            for (const superPatch of patch.children.filter(c => c.type === "before")) {
                try {
                    superPatch.callback(this, arguments);
                }
                catch (err) {
                    Logger.err("Patcher", `Could not fire before callback of ${patch.functionName} for ${superPatch.caller}`, err);
                }
            }

            const insteads = patch.children.filter(c => c.type === "instead");
            if (!insteads.length) { returnValue = patch.originalFunction.apply(this, arguments); }
            else {
                for (const insteadPatch of insteads) {
                    try {
                        const tempReturn = insteadPatch.callback(this, arguments, patch.originalFunction.bind(this));
                        if (typeof (tempReturn) !== "undefined") returnValue = tempReturn;
                    }
                    catch (err) {
                        Logger.err("Patcher", `Could not fire instead callback of ${patch.functionName} for ${insteadPatch.caller}`, err);
                    }
                }
            }

            for (const slavePatch of patch.children.filter(c => c.type === "after")) {
                try {
                    const tempReturn = slavePatch.callback(this, arguments, returnValue);
                    if (typeof (tempReturn) !== "undefined") returnValue = tempReturn;
                }
                catch (err) {
                    Logger.err("Patcher", `Could not fire after callback of ${patch.functionName} for ${slavePatch.caller}`, err);
                }
            }
            return returnValue;
        };
    }

    static rePatch(patch) {
        patch.proxyFunction = patch.module[patch.functionName] = this.makeOverride(patch);
    }

    static makePatch(module, functionName, name) {
        const patch = {
            name,
            module,
            functionName,
            originalFunction: module[functionName],
            proxyFunction: null,
            revert: () => { // Calling revert will destroy any patches added to the same module after this
                patch.module[patch.functionName] = patch.originalFunction;
                patch.proxyFunction = null;
                patch.children = [];
            },
            counter: 0,
            children: []
        };
        patch.proxyFunction = module[functionName] = this.makeOverride(patch);
        Object.assign(module[functionName], patch.originalFunction);
        module[functionName].__originalFunction = patch.originalFunction;
        module[functionName].toString = () => patch.originalFunction.toString();
        this.patches.push(patch);
        return patch;
    }

    /**
     * Function with no arguments and no return value that may be called to revert changes made by {@link module:Patcher}, restoring (unpatching) original method.
     * @callback module:Patcher~unpatch
     */

    /**
     * A callback that modifies method logic. This callback is called on each call of the original method and is provided all data about original call. Any of the data can be modified if necessary, but do so wisely.
     *
     * The third argument for the callback will be `undefined` for `before` patches. `originalFunction` for `instead` patches and `returnValue` for `after` patches.
     *
     * @callback module:Patcher~patchCallback
     * @param {object} thisObject - `this` in the context of the original function.
     * @param {arguments} args - The original arguments of the original function.
     * @param {(function|*)} extraValue - For `instead` patches, this is the original function from the module. For `after` patches, this is the return value of the function.
     * @return {*} Makes sense only when using an `instead` or `after` patch. If something other than `undefined` is returned, the returned value replaces the value of `returnValue`. If used for `before` the return value is ignored.
     */

    /**
     * This method patches onto another function, allowing your code to run beforehand.
     * Using this, you are also able to modify the incoming arguments before the original method is run.
     *
     * @param {string} caller - Name of the caller of the patch function. Using this you can undo all patches with the same name using {@link module:Patcher.unpatchAll}. Use `""` if you don't care.
     * @param {object} moduleToPatch - Object with the function to be patched. Can also patch an object's prototype.
     * @param {string} functionName - Name of the method to be patched
     * @param {module:Patcher~patchCallback} callback - Function to run before the original method
     * @param {object} options - Object used to pass additional options.
     * @param {string} [options.displayName] You can provide meaningful name for class/object provided in `what` param for logging purposes. By default, this function will try to determine name automatically.
     * @param {boolean} [options.forcePatch=true] Set to `true` to patch even if the function doesnt exist. (Adds noop function in place).
     * @return {module:Patcher~unpatch} Function with no arguments and no return value that should be called to cancel (unpatch) this patch. You should save and run it when your plugin is stopped.
     */
    static before(caller, moduleToPatch, functionName, callback, options = {}) { return this.pushChildPatch(caller, moduleToPatch, functionName, callback, Object.assign(options, { type: "before" })); }

    /**
     * This method patches onto another function, allowing your code to run after.
     * Using this, you are also able to modify the return value, using the return of your code instead.
     *
     * @param {string} caller - Name of the caller of the patch function. Using this you can undo all patches with the same name using {@link module:Patcher.unpatchAll}. Use `""` if you don't care.
     * @param {object} moduleToPatch - Object with the function to be patched. Can also patch an object's prototype.
     * @param {string} functionName - Name of the method to be patched
     * @param {module:Patcher~patchCallback} callback - Function to run instead of the original method
     * @param {object} options - Object used to pass additional options.
     * @param {string} [options.displayName] You can provide meaningful name for class/object provided in `what` param for logging purposes. By default, this function will try to determine name automatically.
     * @param {boolean} [options.forcePatch=true] Set to `true` to patch even if the function doesnt exist. (Adds noop function in place).
     * @return {module:Patcher~unpatch} Function with no arguments and no return value that should be called to cancel (unpatch) this patch. You should save and run it when your plugin is stopped.
     */
    static after(caller, moduleToPatch, functionName, callback, options = {}) { return this.pushChildPatch(caller, moduleToPatch, functionName, callback, Object.assign(options, { type: "after" })); }

    /**
     * This method patches onto another function, allowing your code to run instead.
     * Using this, you are also able to modify the return value, using the return of your code instead.
     *
     * @param {string} caller - Name of the caller of the patch function. Using this you can undo all patches with the same name using {@link module:Patcher.unpatchAll}. Use `""` if you don't care.
     * @param {object} moduleToPatch - Object with the function to be patched. Can also patch an object's prototype.
     * @param {string} functionName - Name of the method to be patched
     * @param {module:Patcher~patchCallback} callback - Function to run after the original method
     * @param {object} options - Object used to pass additional options.
     * @param {string} [options.displayName] You can provide meaningful name for class/object provided in `what` param for logging purposes. By default, this function will try to determine name automatically.
     * @param {boolean} [options.forcePatch=true] Set to `true` to patch even if the function doesnt exist. (Adds noop function in place).
     * @return {module:Patcher~unpatch} Function with no arguments and no return value that should be called to cancel (unpatch) this patch. You should save and run it when your plugin is stopped.
     */
    static instead(caller, moduleToPatch, functionName, callback, options = {}) { return this.pushChildPatch(caller, moduleToPatch, functionName, callback, Object.assign(options, { type: "instead" })); }

    /**
     * This method patches onto another function, allowing your code to run before, instead or after the original function.
     * Using this you are able to modify the incoming arguments before the original function is run as well as the return
     * value before the original function actually returns.
     *
     * @param {string} caller - Name of the caller of the patch function. Using this you can undo all patches with the same name using {@link module:Patcher.unpatchAll}. Use `""` if you don't care.
     * @param {object} moduleToPatch - Object with the function to be patched. Can also patch an object's prototype.
     * @param {string} functionName - Name of the method to be patched
     * @param {module:Patcher~patchCallback} callback - Function to run after the original method
     * @param {object} options - Object used to pass additional options.
     * @param {string} [options.type=after] - Determines whether to run the function `before`, `instead`, or `after` the original.
     * @param {string} [options.displayName] You can provide meaningful name for class/object provided in `what` param for logging purposes. By default, this function will try to determine name automatically.
     * @param {boolean} [options.forcePatch=true] Set to `true` to patch even if the function doesnt exist. (Adds noop function in place).
     * @return {module:Patcher~unpatch} Function with no arguments and no return value that should be called to cancel (unpatch) this patch. You should save and run it when your plugin is stopped.
     */
    static pushChildPatch(caller, moduleToPatch, functionName, callback, options = {}) {
        const { type = "after", forcePatch = true } = options;
        const module = this.resolveModule(moduleToPatch);
        if (!module) return null;
        if (!module[functionName] && forcePatch) module[functionName] = function () { };
        if (!(module[functionName] instanceof Function)) return null;

        if (typeof moduleToPatch === "string") options.displayName = moduleToPatch;
        const displayName = options.displayName || module.displayName || module.name || module.constructor.displayName || module.constructor.name;

        const patchId = `${displayName}.${functionName}`;
        const patch = this.patches.find(p => p.module == module && p.functionName == functionName) || this.makePatch(module, functionName, patchId);
        if (!patch.proxyFunction) this.rePatch(patch);
        const child = {
            caller,
            type,
            id: patch.counter,
            callback,
            unpatch: () => {
                patch.children.splice(patch.children.findIndex(cpatch => cpatch.id === child.id && cpatch.type === type), 1);
                if (patch.children.length <= 0) {
                    const patchNum = this.patches.findIndex(p => p.module == module && p.functionName == functionName);
                    if (patchNum < 0) return;
                    this.patches[patchNum].revert();
                    this.patches.splice(patchNum, 1);
                }
            }
        };
        patch.children.push(child);
        patch.counter++;
        return child.unpatch;
    }

}

/**
 * @summary Code taken from BetterDiscord (sourced from commit: cb08178b7702fe2612343f279c007eb2a638a113)
 * @description Changes:
 *
 *  None
 */
const hasThrown = new WeakSet();

/**
 * @summary Code taken from BetterDiscord (sourced from commit: cb08178b7702fe2612343f279c007eb2a638a113)
 * @description Changes:
 *
 *  Formatting changed
 */
const wrapFilter = filter => (exports, module, moduleId) => {
    try {
        if (exports?.default?.remove && exports?.default?.set && exports?.default?.clear && exports?.default?.get && !exports?.default?.sort) return false;
        if (exports.remove && exports.set && exports.clear && exports.get && !exports.sort) return false;
        if (exports?.default?.getToken || exports?.default?.getEmail || exports?.default?.showToken) return false;
        if (exports.getToken || exports.getEmail || exports.showToken) return false;
        return filter(exports, module, moduleId);
    }
    catch (err) {
        if (!hasThrown.has(filter)) Logger.warn("WebpackModules~getModule", "Module filter threw an exception.", filter, err);
        hasThrown.add(filter);
        return false;
    }
};

/**
 * @summary Code taken from BetterDiscord (sourced from commit: cb08178b7702fe2612343f279c007eb2a638a113)
 * @description Changes:
 *
 *  Occurrences of "this.getAllModules()" replaced with "Vencord.Webpack.cache"
 *
 *  Formatting changed
 */
function getModule(filter, options = {}) {
    const { first = true, defaultExport = true, searchExports = false } = options;
    const wrappedFilter = wrapFilter(filter);

    const modules = Vencord.Webpack.cache;
    const rm = [];
    const indices = Object.keys(modules);
    for (let i = 0; i < indices.length; i++) {
        const index = indices[i];
        if (!modules.hasOwnProperty(index)) continue;

        let module = null;
        try { module = modules[index]; } catch { continue; }

        const { exports } = module;
        if (!exports || exports === window || exports === document.documentElement || exports[Symbol.toStringTag] === "DOMTokenList") continue;

        if (typeof (exports) === "object" && searchExports && !exports.TypedArray) {
            for (const key in exports) {
                let foundModule = null;
                let wrappedExport = null;
                try { wrappedExport = exports[key]; } catch { continue; }

                if (!wrappedExport) continue;
                if (wrappedFilter(wrappedExport, module, index)) foundModule = wrappedExport;
                if (!foundModule) continue;
                if (first) return foundModule;
                rm.push(foundModule);
            }
        }
        else {
            let foundModule = null;
            if (exports.Z && wrappedFilter(exports.Z, module, index)) foundModule = defaultExport ? exports.Z : exports;
            if (exports.ZP && wrappedFilter(exports.ZP, module, index)) foundModule = defaultExport ? exports.ZP : exports;
            if (exports.__esModule && exports.default && wrappedFilter(exports.default, module, index)) foundModule = defaultExport ? exports.default : exports;
            if (wrappedFilter(exports, module, index)) foundModule = exports;
            if (!foundModule) continue;
            if (first) return foundModule;
            rm.push(foundModule);
        }


    }

    return first || rm.length == 0 ? undefined : rm;
}

const ReactUtils_filler = {
    DiscordModules: {},
    setup(DiscordModules) {
        this.DiscordModules = DiscordModules;
    },
    /**
     * @summary Code taken from BetterDiscord (sourced from commit: 9f08d7cbf5d41c24bb00d3575cf820d7e17a4039)
     * @description Changes:
     *
     *  Added local DiscordModules destructure from `this`.
     *
     *  Formatting changed
     */
    wrapElement(element) {
        const { DiscordModules } = this;
        return class ReactWrapper extends DiscordModules.React.Component {
            constructor(props) {
                super(props);
                this.ref = DiscordModules.React.createRef();
                this.element = element;
                this.state = { hasError: false };
            }
            componentDidCatch() { this.setState({ hasError: true }); }
            componentDidMount() { this.ref.current.appendChild(this.element); }
            render() { return this.state.hasError ? null : DiscordModules.React.createElement("div", { className: "react-wrapper", ref: this.ref }); }
        };
    }
}

export { getModule, monkeyPatch, Patcher, ReactUtils_filler };

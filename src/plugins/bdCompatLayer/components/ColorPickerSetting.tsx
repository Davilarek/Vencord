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

import { SettingProps, SettingsSection } from "@components/settings/tabs/plugins/components/Common";
import { PluginSettingCommon } from "@utils/types";
import { ColorPicker, useState } from "@webpack/common";

export function ColorPickerSettingComponent(props: SettingProps<PluginSettingCommon & { color: string, colorPresets: string[], }>) {
    const [error, setError] = useState<string | null>(null);
    const handleColorChange = (colorInt: number) => {
        const hexColor = "#" + colorInt.toString(16).padStart(6, "0");
        props.onChange(hexColor);
    };
    return <SettingsSection name={props.id} description={props.option.description} error={error}>
        {/* return (<div className={cl("settings")}>
        <div className={cl("container")}>
            <div className={cl("settings-labels")}>
                {/* <Forms.FormTitle tag="h3"></Forms.FormTitle>/}
                <Forms.FormText>${props.option.description}</Forms.FormText>
            </div>
            */}
        <ColorPicker
            color={parseInt((props.option.color || "#000000").replace("#", ""), 16)}
            onChange={handleColorChange}
            showEyeDropper={false}
            suggestedColors={props.option.colorPresets}
        // {...props.option.componentProps}
        />
        {/* </div>*/}
        {/* </div>);*/}
    </SettingsSection>
}

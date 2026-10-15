<#macro content>
    <#if realm.password && (pageId == "login" || pageId == "login-username" || pageId == "login-password" || pageId == "register")>
        <aside id="studio-login-help" class="studio-login-help" aria-labelledby="studio-login-help-title">
            <h2 id="studio-login-help-title">${msg("studioLoginHelpTitle")}</h2>
            <#if pageId == "register">
                <p>${msg("studioRegistrationHelp")}</p>
                <a class="studio-login-help-link" href="${url.loginUrl}">${msg("backToLogin")}</a>
            <#else>
                <p>${msg("studioLoginHelpExisting")}</p>
                <#if realm.resetPasswordAllowed>
                    <p>${msg("studioLoginHelpReset")}</p>
                    <a class="studio-login-help-link" href="${url.loginResetCredentialsUrl}">${msg("studioLoginHelpResetLink")}</a>
                <#else>
                    <p>${msg("studioLoginHelpSupport")}</p>
                </#if>
            </#if>
        </aside>
    </#if>
</#macro>

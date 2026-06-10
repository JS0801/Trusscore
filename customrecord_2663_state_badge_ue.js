/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['N/log', 'N/search', 'N/ui/serverWidget'], (log, search, serverWidget) => {
    const RECORD_TYPE = 'customrecord_2663_entity_bank_details';
    const DEFAULT_BADGE_THEME = 'neutral';

    const STATE_BADGE_MAP = {
        'submit': {
          label: 'Pending Submission',
          theme: 'warning'
         },
         'pending approval-payment coordinator': {
             label: 'Pending Approval (APC)',
             theme: 'warning'
         },
         'rejected (ap)': {
             label: 'Rejected (APC)',
             theme: 'danger'
         },
        'finance approval': {
            label: 'Pending Approval (Finance)',
            theme: 'warning'
        },
        'rejected': {
            label: 'Rejected (Finance)',
            theme: 'danger'
        },
        'approved': {
            label: 'Approved',
            theme: 'success'
        },
        'update': {
          label: 'Update Submission',
          theme: 'warning'
         },
         'stop using bank details': {
           label: 'Inactive',
           theme: 'warning'
          }
    };

    const STATE_COLUMN = search.createColumn({
        name: 'currentstate',
        join: 'workflow',
        label: 'Current State'
    });

    function beforeLoad(context) {
        try {
            if (!context.newRecord || !context.newRecord.id) {
                return;
            }

            if (
                context.type !== context.UserEventType.VIEW &&
                context.type !== context.UserEventType.EDIT
            ) {
                return;
            }

            const stateName = getWorkflowStateName(context.newRecord.id);

            if (!stateName) {
                return;
            }

            const badgeConfig = getBadgeConfig(stateName);

            addWorkflowStateBadge(context.form, badgeConfig);
        } catch (error) {
            log.error({
                title: 'Workflow state badge beforeLoad failed',
                details: error
            });
        }
    }

    function getWorkflowStateName(recordId) {
        let stateName = '';

        const stateSearch = search.create({
            type: RECORD_TYPE,
            filters: [
                ['internalid', 'anyof', recordId]
            ],
            columns: [
                STATE_COLUMN
            ]
        });

        stateSearch.run().each((result) => {
            const stateText = result.getText(STATE_COLUMN);
            const stateValue = result.getValue(STATE_COLUMN);

            stateName = normalizeSearchValue(stateText || stateValue);

            return !stateName;
        });

        return stateName;
    }

    function normalizeSearchValue(value) {
        if (Array.isArray(value)) {
            return value.join(', ').trim();
        }

        return String(value || '').trim();
    }

    function getBadgeConfig(stateName) {
        const mappedConfig = STATE_BADGE_MAP[getStateMapKey(stateName)];

        if (!mappedConfig) {
            return {
                label: stateName,
                theme: DEFAULT_BADGE_THEME,
                sourceStateName: stateName
            };
        }

        if (typeof mappedConfig === 'string') {
            return {
                label: mappedConfig,
                theme: DEFAULT_BADGE_THEME,
                sourceStateName: stateName
            };
        }

        return {
            label: normalizeSearchValue(mappedConfig.label) || stateName,
            theme: normalizeSearchValue(mappedConfig.theme) || DEFAULT_BADGE_THEME,
            sourceStateName: stateName
        };
    }

    function getStateMapKey(stateName) {
        return normalizeSearchValue(stateName).toLowerCase();
    }

    function addWorkflowStateBadge(form, badgeConfig) {
        const htmlField = form.addField({
            id: 'custpage_workflow_state_badge_html',
            label: 'Workflow State Badge',
            type: serverWidget.FieldType.INLINEHTML
        });

        htmlField.defaultValue = `
            <style>
                #custpage_workflow_state_badge_html_fs,
                #custpage_workflow_state_badge_html_fs_lbl {
                    display: none !important;
                }

                #custpage_workflow_state_badge {
                    display: inline-flex !important;
                    align-items: center;
                    margin-left: 8px;
                    padding: 2px 8px;
                    border: 1px solid #b8c6d6;
                    border-radius: 3px;
                    background: #eef2f6;
                    color: #34495e;
                    font-size: 12px !important;
                    font-weight: 600;
                    line-height: 16px;
                    text-transform: uppercase;
                    vertical-align: middle;
                    white-space: nowrap;
                }

                #custpage_workflow_state_badge[data-badge-theme="success"] {
                    border-color: #8fb88f;
                    background: #e8f4e8;
                    color: #246b24;
                }

                #custpage_workflow_state_badge[data-badge-theme="warning"] {
                    border-color: #d8b35a;
                    background: #fff4d8;
                    color: #7a5200;
                }

                #custpage_workflow_state_badge[data-badge-theme="danger"] {
                    border-color: #d79b9b;
                    background: #fbeaea;
                    color: #8f1d1d;
                }

                #custpage_workflow_state_badge[data-badge-theme="muted"] {
                    border-color: #b9b9b9;
                    background: #eeeeee;
                    color: #555555;
                }
            </style>
            <script>
                (function () {
                    var badgeLabel = ${toJavaScriptString(badgeConfig.label)};
                    var badgeTheme = ${toJavaScriptString(badgeConfig.theme)};
                    var sourceStateName = ${toJavaScriptString(badgeConfig.sourceStateName)};
                    var badgeId = 'custpage_workflow_state_badge';

                    function findRecordTitle() {
                        return document.querySelector('.uir-record-name') ||
                            document.querySelector('.uir-page-title-firstline h1') ||
                            document.querySelector('.uir-page-title h1') ||
                            document.querySelector('#div__title h1') ||
                            document.querySelector('h1');
                    }

                    function addBadge() {
                        var title = findRecordTitle();

                        if (!title || document.getElementById(badgeId)) {
                            return Boolean(title);
                        }

                        var badge = document.createElement('span');
                        badge.id = badgeId;
                        badge.className = 'uir-record-status';
                        badge.textContent = badgeLabel;
                        badge.setAttribute('data-badge-theme', badgeTheme);
                        badge.setAttribute('title', 'Workflow state: ' + sourceStateName);
                        badge.setAttribute('aria-label', 'Workflow current state: ' + sourceStateName);

                        title.appendChild(document.createTextNode(' '));
                        title.appendChild(badge);

                        return true;
                    }

                    if (document.readyState === 'loading') {
                        document.addEventListener('DOMContentLoaded', addBadge);
                    } else {
                        addBadge();
                    }

                    var attempts = 0;
                    var timer = window.setInterval(function () {
                        attempts += 1;

                        if (addBadge() || attempts >= 20) {
                            window.clearInterval(timer);
                        }
                    }, 250);
                }());
            </script>
        `;
    }

    function toJavaScriptString(value) {
        return JSON.stringify(String(value || '')).replace(/<\//g, '<\\/');
    }

    return {
        beforeLoad
    };
});

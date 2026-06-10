/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['N/log', 'N/search', 'N/ui/serverWidget'], (log, search, serverWidget) => {
    const RECORD_TYPE = 'customrecord_2663_entity_bank_details';

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

            addWorkflowStateBadge(context.form, stateName);
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

    function addWorkflowStateBadge(form, stateName) {
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
            </style>
            <script>
                (function () {
                    var stateName = ${toJavaScriptString(stateName)};
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
                        badge.textContent = stateName;
                        badge.setAttribute('aria-label', 'Workflow current state: ' + stateName);

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

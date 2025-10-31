module.exports = async ({ github, context, core }) => {
  const owner = context.repo.owner;
  const repo = context.repo.repo;
  const issueNumber = context.payload.issue.number;

  const STATUS_FIELD_NAME = "Status";
 
  const actualProjectId = "PVT_kwDOA5i8as4BC9Vt";

async function listProjectIssues(projectId = actualProjectId) {
    let hasNextPage = true;
    let after = null;

    while (hasNextPage) {
        const q = `
            query ($after:String) {
                node(id:"PVT_kwDOA5i8as4BC9Vt") {
                    ... on ProjectV2 {
                        items(first:100, after:$after) {
                            nodes {
                                id
                                content {
                                    ... on Issue {
                                            number
                                            title
                                            issueType {
                                                name
                                                
                                            }
                                            subIssues(first:100) {
                                                nodes {
                                                    id
                                                    number
                                                }
                                            }
                                            

                                        }
                                }
                                fieldValueByName(name:"Status") {
                                    ... on ProjectV2ItemFieldSingleSelectValue {
                                        name
                                    }
                                }
                            }
                        }
                    }
                }
            }`;
        const res = await github.graphql(q, { projectId, after });
        const items = res.node?.items?.nodes || [];

        for (const it of items) {
            content = it.content;
            if (!content) continue;
            core.info(`issue ${content}`)
            if (content.issueType?.name == "Epic") {
                
                parentStatus =  it.fieldValueByName?.name
                core.info(`is Epic with status ${parentStatus}`)
            }
        }

        const pageInfo = res.node?.items?.pageInfo;
        hasNextPage = pageInfo?.hasNextPage || false;
        after = pageInfo?.endCursor || null;
    }

    return results;
}

  async function getStatusFieldInfo() {
    const q = `
      query($projectId: ID!, $fieldName: String!) {
        node(id: $projectId) {
          ... on ProjectV2 {
            field(name: $fieldName) {
              ... on ProjectV2SingleSelectField {
                id
                options { id name }
              }
            }
          }
        }
      }`;
    const res = await github.graphql(q, { projectId: actualProjectId, fieldName: STATUS_FIELD_NAME });
    return res.node.field;
  }

  async function updateIssueStatus(issueNumber, newStatus) {
    const fieldInfo = await getStatusFieldInfo();
    const statusOption = fieldInfo.options.find(o => o.name === newStatus);
    if (!statusOption) {
      core.warning(`Status "${newStatus}" not found in project`);
      return;
    }

    const qItem = `
      query($owner:String!, $repo:String!, $number:Int!, $projectId:ID!) {
        repository(owner:$owner, name:$repo) {
          issue(number:$number) {
            projectItems(first:10) {
              nodes { id project { id } }
            }
          }
        }
      }`;
    const rItem = await github.graphql(qItem, { owner, repo, number: issueNumber, projectId: actualProjectId });
    const items = rItem.repository.issue.projectItems.nodes.filter(n => n.project.id === actualProjectId);
    
    if (!items.length) {
      core.warning(`Issue #${issueNumber} not in project ${actualProjectId}`);
      return;
    }

    const itemId = items[0].id;
    const mutation = `
      mutation($projectId:ID!, $itemId:ID!, $fieldId:ID!, $value:String!) {
        updateProjectV2ItemFieldValue(input: {
          projectId: $projectId
          itemId: $itemId
          fieldId: $fieldId
          value: { singleSelectOptionId: $value }
        }) {
          projectV2Item { id }
        }
      }`;

    await github.graphql(mutation, {
      projectId: actualProjectId,
      itemId: itemId,
      fieldId: fieldInfo.id,
      value: statusOption.id
    });
    
    core.info(`Updated issue #${issueNumber} to status "${newStatus}"`);
  }

  async function syncSubIssuesStatus(issueNumber) {
        const epicStatus = await getIssueStatus(issueNumber);
        const subIssues = await listSubIssues(issueNumber);

        core.info(`Epic status: ${epicStatus}, found ${subIssues.length} sub-issues`);

        for (const subIssue of subIssues) {
            const subIssueStatus = await getIssueStatus(subIssue.number);

            if (epicStatus === "Backlog") {
                await updateIssueStatus(subIssue.number, "Backlog");
            } else if (epicStatus === "Done") {
                await updateIssueStatus(subIssue.number, "Done");
            } else if (subIssueStatus === "Backlog") {
                await updateIssueStatus(subIssue.number, "Todo");
            }
        }
        return;
  }

  core.info(`Processing`);
  await listProjectIssues();

  
};

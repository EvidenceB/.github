module.exports = async ({ github, context, core }) => {
  const owner = context.repo.owner;
  const repo = context.repo.repo;
  const issueNumber = context.payload.issue.number;

  const PROJECT_NUMBER = process.env.PROJECT_NUMBER;
  const STATUS_FIELD_NAME = "Status";

  async function getProjectId() {    
    const query = `
      query($owner: String!, $number: Int!) {
        organization(login: $owner) {
          projectV2(number: $number) { id }
        }
      }`;
      
    try {
      const result = await github.graphql(query, { owner: "EvidenceB", number: 6 });
      core.error(`result ${result}`)
      return result.user?.projectV2?.id || result.organization?.projectV2?.id;
    } catch (e) {      
      core.error(`Failed to get project ID from number ${PROJECT_NUMBER}: ${e.message}`);
      throw e;
    }
  }

  const actualProjectId = "PVT_kwDOA5i8as4BC9Vt";

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

  async function isEpic(issueNumber) {
    const q = `
      query($owner:String!, $repo:String!, $number:Int!) {
        repository(owner:$owner, name:$repo) {
          issue(number:$number) { issueType { name } }
        }
      }`;
    const r = await github.graphql(q, { owner, repo, number: issueNumber });
    return r.repository.issue.issueType?.name === "Epic";
  }

  async function getParentIssue(childNumber) {
    try {
      const { data } = await github.request(
        'GET /repos/{owner}/{repo}/issues/{issue_number}/parent',
        { owner, repo, issue_number: childNumber }
      );
      return data;
    } catch (e) {
      return null;
    }
  }

  async function listSubIssues(parentNumber) {
    try {
      const { data } = await github.request(
        'GET /repos/{owner}/{repo}/issues/{issue_number}/sub_issues',
        { owner, repo, issue_number: parentNumber }
      );
      return data || [];
    } catch (e) {
      return [];
    }
  }

  async function getIssueStatus(issueNumber) {
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
    const rItem = await github.graphql(qItem, { owner, repo, number: issueNumber });
    const items = rItem.repository.issue.projectItems.nodes.filter(n => n.project.id === actualProjectId);
    
    if (!items.length) return null;
    
    const itemId = items[0].id;
    const fieldInfo = await getStatusFieldInfo();
    
    const qStatus = `
      query($itemId:ID!, $fieldId:ID!) {
        node(id:$itemId) {
          ... on ProjectV2Item {
            fieldValueByFieldId(fieldId:$fieldId) {
              ... on ProjectV2ItemFieldSingleSelectValue { name }
            }
          }
        }
      }`;
    const resStatus = await github.graphql(qStatus, { itemId, fieldId: fieldInfo.id });
    return resStatus.node.fieldValueByFieldId?.name || null;
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

  core.info(`Processing issue #${issueNumber}`);

  if (await isEpic(issueNumber)) {
    core.info(`Issue #${issueNumber} is an epic - processing sub-issues`);
    return await syncSubIssuesStatus(issueNumber);
  }

  const parent = await getParentIssue(issueNumber);
  if (!parent) {
    core.info(`Issue #${issueNumber} is not an epic and has no parent - terminating`);
    return;
  }

  core.info(`Issue #${issueNumber} has parent #${parent.number} - processing as epic`);
  return await syncSubIssuesStatus(parent.number);
};

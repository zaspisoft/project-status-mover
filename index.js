const core = require("@actions/core");
const { graphql } = require("@octokit/graphql");


const projectItemsQuery = (project_id, after) =>  `
query{
    node(id: "${project_id}") {
  ... on ProjectV2 {
    
    items(first: 100,orderBy: {
      field: POSITION,
      direction:DESC
    }${ after ? `, after: "${after}"`: ""}) {
      totalCount
      pageInfo {
        hasNextPage,
        endCursor
      }
      nodes{
        id
        content{ 
          ...on Issue {
            title
            id
            databaseId
            number
          }
        }
      }
    }
  }
}
}
`


const getAllProjectItems = async (project_id, graphqlWithAuth) => {
	let payloads = []
	let nextCursor = null;
	while(true) {

		const projectQueryItems = await graphqlWithAuth(projectItemsQuery(project_id, nextCursor))
		console.log(projectQueryItems.node.items.pageInfo.hasNextPage)
		payloads = [...payloads, ...projectQueryItems.node.items.nodes]
		nextCursor = projectQueryItems.node.items.pageInfo.endCursor
		if (!projectQueryItems.node.items.pageInfo.hasNextPage) {
			break
		}

	}

	return payloads
}


try {
  /**
   * Getting the variables
   */
  const projectNumber = core.getInput("project_number");
  const organization = core.getInput("org");
  const issue_id = core.getInput("issue_id");
  const status_field = core.getInput("status_field");
  const status_value = core.getInput("status_value");
  const pat = core.getInput("token");

  const graphqlWithAuth = graphql.defaults({
    headers: {
      authorization: `Bearer ${pat}`,
    },
  });

	(async () => {

  const paylod = await graphqlWithAuth(
    `
		query {
			organization(login: "${organization}") {
				projectV2(number: ${projectNumber}) {
					id
				}
			}
		}
	`)
		
	const project_id =  paylod.organization.projectV2.id


	const payload = await graphqlWithAuth(
		`
		query {
		node(id: "${project_id}") {
				... on ProjectV2 {
				fields(first: 20) {
					nodes {
						... on ProjectV2Field {
							id
							name
						}
						... on ProjectV2IterationField {
							id
							name
							configuration {
								iterations {
									startDate
									id
								}
							}
						}
						... on ProjectV2SingleSelectField {
							id
							name
							options {
								id
								name
							}
						}
					}
				}
			}
		}
}
		`
	)

	const nodes = payload.node.fields.nodes

	const fieldNode = nodes.filter(each => each.name == status_field)[0]

	const stats_field_id = fieldNode.id
	const option_id = fieldNode.options.filter(each => each.name == status_value)[0].id


	const allProjectItems = await getAllProjectItems(project_id, graphqlWithAuth)

	const itemId = allProjectItems.node.items.nodes.filter(each => each.content.databaseId == issue_id)[0].id
	

	// Change the Status

	const query = `
	mutation {
    set_status: updateProjectV2ItemFieldValue(input: {
      projectId: "${project_id}"
      itemId: "${itemId}"
      fieldId: "${stats_field_id}"
      value: { 
        singleSelectOptionId: "${option_id}"
        }
    }) {
      projectV2Item {
        id
        }
    }
  }`

	await graphqlWithAuth(query)
	
	})()
	
} catch (error) {
  core.setFailed(error.message);
}

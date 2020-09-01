
# Manage Azure Policy Action

With Manage Azure Policy Action you can now create or update Azure policies from your GitHub Workflows. Since workflows are totally customizable, you can have a complete control over the sequence in which Azure policies are rolled out. Its now even easier to follow safe deployment practices and catch regressions or bugs well before policies are applied on  critical resources. 

Manage Azure Policy Action assumes that all the Azure policy files are already available in the source reporitory in a defined directory structure. [TODO - add link]. You can use the recently rolled out 'Export' feature [TODO - add link] in Azure Policy service to export selected policies to GitHub. 

New to Azure Policy? Its an Azure service that lets you enforce organizational standards and asses compliance at scale. To know more check out: [Azure Policies - Overview](https://docs.microsoft.com/en-us/azure/governance/policy/overview)

The definition of this Github Action is in action.yml[TODO - add link]


# Pre-requisites:
* Azure Login Action: Authenticate using [Azure Login](https://github.com/Azure/login)  action. The Manage Azure Policy action assumes that Azure Login is done using an Azure service principal that has [sufficient permissions](https://docs.microsoft.com/en-us/azure/governance/policy/overview#rbac-permissions-in-azure-policy) to write policy on selected scopes. Once login is done, the next set of actions in the workflow can perform tasks such as creating policies or updating them. For more details on permissions, checkout 'Configure credentials for Azure login action' section in this page  or alternatively you can refer the full [documentation](https://github.com/Azure/login) of Azure Login Action.
* Azure Checkout Action: All  policies files should be downloaded from the GitHub repository to the GitHub runner. You can use [checkout action](https://github.com/actions/checkout) for doing so. Refer the 'End-to-End Sample Workflows' section in this page for examples.



# Inputs for the Action

* `paths`: mandatory. The path(s) to the directory that contains Azure policy files. The files present only in these directories  will be considered by this action for updating policies in Azure. You can use wild card characters as mentioned * or ** for specifying sub folders in a path. For more details on the use of the wild cards check [glob wildcard patterns](https://facelessuser.github.io/wcmatch/glob/). Note that a definition file should be named as _'policy.json'_ and assignment filenames should start with _'assign'_ keyword.
* `ignore-paths`: Optional. These are the directory paths that will be ignored by the action. If you have a specific policy folder that is not ready to be applied yet, specify the path here. Note that ignore-paths has a higher precedence compared to paths.
* `assignments`: Optional. These are policy assignment files that would be considered by the action. This parameter is especially useful if you want to apply only those assignments that correspond to a specific environment. E.g. _assign.AllowedVMSKUs-dev-rg.json_. You can use wild card character '*' to match multiple file names. E.g. _assign.\*dev\*.json_. If this parameter is not specified, the action will consider all assignment files that are present in the directories mentioned in paths parameter.
* `mode`: Optional. There are 2 modes for this action - incremental and complete. If not specified, the action will use incremental mode by default. In incremental mode, the action will compare already exisiting policy in azure with the contents of policy provided in repository file. It will apply the policy only if there is a mismatch. On the contrary, the complete mode will apply all the files present in the specified paths irrespective of whether or not repository policy file has been updated.
* `enforce`: Optional. This corresponds to the [enforcement mode](https://docs.microsoft.com/en-us/azure/governance/policy/concepts/assignment-structure#enforcement-mode) in Azure policy assignmetns. This parameter is especially useful when you want to test assignments by first deploying them with doNotEnforce mode. You can specify the assignment file names you want to enforce. E.g. assign.addTags\*.json. To specify doNotEnforce, use a ! before the name. E.g. !assign.denyVMSKUs-*.json.  By default this parameter takes the value specified in the json file. [TODO - how does glob handle wildcard]
* `force-update`: Optional. Defaults to false. If this is set as true, in case of dependency errors(Eg. Updates tries to delete a Policy definition parameter that is used by assignments), the action will try to delete exisiting policy definitions and assignments and recreate them. [TODO -Remove this field?]


# End-to-End Sample Workflows

  
### Sample workflow to apply all  policy file changes in a given directory to Azure Policy


```yaml
# File: .github/workflows/workflow.yml

on: push

jobs:
  apply-azure-policy:    
    runs-on: ubuntu-latest
    steps:
    # Azure Login       
    - name: Login to Azure
      uses: azure/login@v1
      with:
        creds: ${{secrets.AZURE_CREDENTIALS}}  
    - name: Checkout
      uses: actions/checkout@v2 
    - name: Create or Update Azure Policies
      uses: azure/manage-azure-policy@v0
      with:      
        paths:                  
        - policies/**  # path to directory where policy files were downloaded in runner
        
```
The above workflow will apply all the updates to policy files in /azure-policy/policies/** directory to Azure Policy.


### Sample workflow to apply only a subset of assignments from a given directory to Azure policy


```yaml
# File: .github/workflows/workflow.yml

on: push

jobs:
  apply-azure-policy:    
    runs-on: ubuntu-latest
    steps:
    # Azure Login       
    - name: Login to Azure
      uses: azure/login@v1
      with:
        creds: ${{secrets.AZURE_CREDENTIALS}}  
    - name: Checkout
      uses: actions/checkout@v2 
    - name: Create or Update Azure Policies
      uses: azure/manage-azure-policy@v0
      with:      
        paths:                  
        - policies/**  # path to directory where policy files were downloaded in runner
        assignments:
        - assign.*_devRG_*.json # Apply only assignment files that match this pattern
        
```
The above workflow will apply all the updates to policy files in /azure-policy/policies/** directory to Azure Policy.


## Configure credentials for Azure login action:

[TODO] Details of how to add policy contributor permission

With the Azure login Action, you can perform an Azure login using [Azure service principal](https://docs.microsoft.com/en-us/azure/active-directory/develop/app-objects-and-service-principals). The credentials of Azure Service Principal can be added as [secrets](https://help.github.com/en/articles/virtual-environments-for-github-actions#creating-and-using-secrets-encrypted-variables) in the GitHub repository and then used in the workflow. Follow the below steps to generate credentials and store in github.


  * Prerequisite: You should have installed Azure cli on your local machine to run the command or use the cloudshell in the Azure portal. To install Azure cli, follow [Install Azure Cli](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli?view=azure-cli-latest). To use cloudshell, follow [CloudShell Quickstart](https://docs.microsoft.com/en-us/azure/cloud-shell/quickstart). After you have one of the above ready, follow these steps: 
  
  
  * Run the below Azure cli command and copy the output JSON object to your clipboard.

[TODO] update commands to have proper permission..
```bash  
  
   az ad sp create-for-rbac --name "myApp" --role contributor \
                            --scopes /subscriptions/{subscription-id} \
                            --sdk-auth
                            
  # Replace {subscription-id} with the subscription identifiers
  
  # The command should output a JSON object similar to this:

  {
    "clientId": "<GUID>",
    "clientSecret": "<GUID>",
    "subscriptionId": "<GUID>",
    "tenantId": "<GUID>",
    (...)
  }
  
```
  * Define a 'New secret' under your GitHub repository settings -> 'Secrets' menu. Lets name it 'AZURE_CREDENTIALS'.
  * Paste the contents of the clipboard as the value of  the above secret variable.
  * Use the secret variable in the Azure Login Action(Refer to the examples above)


If needed, you can modify the Azure CLI command to further reduce the scope for which permissions are provided. Here is the command that gives contributor access to only a resource group.

```bash  
  
   az ad sp create-for-rbac --name "myApp" --role contributor \
                            --scopes /subscriptions/{subscription-id}/resourceGroups/{resource-group} \
                            --sdk-auth
                            
  # Replace {subscription-id}, {resource-group} with the subscription and resource group identifiers.
  
```

You can also provide permissions to multiple scopes using the Azure CLI command: 

```bash  
  
   az ad sp create-for-rbac --name "myApp" --role contributor \
                            --scopes /subscriptions/{subscription-id}/resourceGroups/{resource-group1} \
                            /subscriptions/{subscription-id}/resourceGroups/{resource-group2} \
                            --sdk-auth
                            
  # Replace {subscription-id}, {resource-group1}, {resource-group2} with the subscription and resource group identifiers.
  
```


# Contributing

This project welcomes contributions and suggestions.  Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit https://cla.opensource.microsoft.com.

When you submit a pull request, a CLA bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., status check, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

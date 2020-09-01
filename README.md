
# Manage Azure Policy Action

With Manage Azure Policy Action you can now create or update Azure policies from your GitHub Workflows. Since workflows are totally customizable, you can have a complete control over the sequence in which Azure policies are rolled out. Its now even easier to follow safe deployment practices and catch regressions or bugs well before policies are applied on  critical resources. 

Manage Azure Policy Action assumes that all the Azure policy files are already available in the source reporitory in a defined directory structure. See pre-requisites. You can use the recently rolled out 'Export Definition' feature in Azure Policy to export selected policies to GitHub.

New to Azure Policy? Its an Azure service that lets you enforce organizational standards and asses compliance at scale. To know more check out: [Azure Policies - Overview](https://docs.microsoft.com/en-us/azure/governance/policy/overview)

The definition of this Github Action is in action.yml[TODO - add link]


# Pre-requisites:
* Azure Login Action: Authenticate using [Azure Login](https://github.com/Azure/login)  action. The Manage Azure Policy action assumes that Azure Login is done using an Azure service principal that has [sufficient permissions](https://docs.microsoft.com/en-us/azure/governance/policy/overview#rbac-permissions-in-azure-policy) to write policy on selected scopes. Once login is done, the next set of actions in the workflow can perform tasks such as creating policies or updating them. For more details on permissions, checkout 'Configure credentials for Azure login action' section in this page  or alternatively you can refer the full [documentation](https://github.com/Azure/login) of Azure Login Action.
* Azure Checkout Action: All  policies files should be downloaded from the GitHub repository to the GitHub runner. You can use [checkout action](https://github.com/actions/checkout) for doing so. Refer the 'End-to-End Sample Workflows' section in this page for examples.
* Azure Policy files should be present in the following directory structure. You can also export policies from Azure portal. (Go to _Definitions_ section in Azure Policy and Click on _Export definitions_ button)

|- policies/  ___________________________ # Root folder for policies
|  |- <policy1_name>/  __________________ # Subfolder for a policy
|     |- policy.json ____________________ # Policy definition
|     |- assign.<name>.json _____________ # Assignment1 for the policy definition in this folder
|     |- assign.<name>.json _____________ # Assignment2 for the policy definition in this folder
|     |- assign.<name>.json _____________ # Assignment3 for the policy definition in this folder
|
|  |- <policy2_name>/  __________________ # Subfolder for another policy
|     |- policy.json ____________________ # Policy definition
|     |- assign.<name>.json _____________ # Assignment1 for the policy definition in this folder
|     |- assign.<name>.json _____________ # Assignment2 for the policy definition in this folder
|     |- assign.<name>.json _____________ # Assignment3 for the policy definition in this folder
|     |- assign.<name>.json _____________ # Assignment4 for the policy definition in this folder
|     |- assign.<name>.json _____________ # Assignment5 for the policy definition in this folder


# Inputs for the Action

* `paths`: mandatory. The path(s) to the directory that contains Azure policy files. The files present only in these directories  will be considered by this action for updating policies in Azure. You can use wild card characters as mentioned * or ** for specifying sub folders in a path. For more details on the use of the wild cards check [glob wildcard patterns](https://facelessuser.github.io/wcmatch/glob/). Note that a definition file should be named as _'policy.json'_ and assignment filenames should start with _'assign'_ keyword.
* `ignore-paths`: Optional. These are the directory paths that will be ignored by the action. If you have a specific policy folder that is not ready to be applied yet, specify the path here. Note that ignore-paths has a higher precedence compared to `paths` parameter.
* `assignments`: Optional. These are policy assignment files that would be considered by the action. This parameter is especially useful if you want to apply only those assignments that correspond to a specific environment for following a safe deployment practice. E.g. _assign.AllowedVMSKUs-dev-rg.json_. You can use wild card character '*' to match multiple file names. E.g. _assign.\*dev\*.json_. If this parameter is not specified, the action will consider all assignment files that are present in the directories mentioned in `paths` parameter.
* `mode`: Optional. There are 2 modes for this action - incremental and complete. If not specified, the action will use incremental mode by default. In incremental mode, the action will compare already exisiting policy in azure with the contents of policy provided in repository file. It will apply the policy only if there is a mismatch. On the contrary, the complete mode will apply all the files present in the specified paths irrespective of whether or not repository policy file has been updated.
* `enforce`: Optional. This corresponds to the [enforcement mode](https://docs.microsoft.com/en-us/azure/governance/policy/concepts/assignment-structure#enforcement-mode) in Azure policy assignments. This parameter is especially useful when you want to test assignments by first deploying them with _doNotEnforce_ enforcement mode. You can specify the assignment filenames you want to enforce. E.g. _assign.addTags\*.json_. or the ones that you do not want to enforce(use a ! before the filename). E.g. _!assign.denyVMSKUs-*.json_. Note that by default this parameter takes the value specified in the assignment json file, however, the value specified in this action will takes precedence over the one mentioned in assignment file.    [TODO - how does glob handle wildcard]
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
        paths:  |                  
          policies/**  # path to directory where policy files were downloaded in runner
        
```
The above workflow will apply policy files changees in /azure-policy/policies/** ([see pattern syntax](https://facelessuser.github.io/wcmatch/glob/)) directory to Azure Policy.


### Sample workflow to apply only a subset of assignments from a given directory to Azure Policy


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
        paths:  |                
          policies/**  # path to directory where policy files were downloaded in runner
        assignments:  |
          assign.*_testRG_*.json # Apply only assignment files that match this pattern
        
```
The above workflow will apply policy files changes only in /azure-policy/policies/** directory. For each directory, the action will first apply the definition and then assignments that have 'testRG' in their filename. This assignment field is especially useful for risk mitigation scenarios, where you first want to apply assignments corresponding to a specific environment like 'test'. 


### Sample workflow to apply policies in a specific enforcement mode


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
        paths:  |                
          policies/**  # path to directory where policy files were downloaded in runner
        enforce:  |          
          '!assign.denyVMSKUs*.json'; #DoNotEnforce 
          'assign.addTags*.json'
        
        
```
The above workflow will apply policy files changes only in /azure-policy/policies/** directory. For each directory, all assignment filenames matching _assign.denyVMSKUs*.json_ pattern will be applied to Azure policy with [doNotEnforce](https://docs.microsoft.com/en-us/azure/governance/policy/concepts/assignment-structure#enforcement-mode) enforcement mode. All  assignment filenames matching _assign.addTags*.json_ pattern will be applied to Azure policy with [default](https://docs.microsoft.com/en-us/azure/governance/policy/concepts/assignment-structure#enforcement-mode) enforcement mode(i.e., they will be enforced). 




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
# Feedback

If you have any changes you’d like to see or suggestions for this action,  we’d love your feedback ❤️ . Please feel free to raise a GitHub issue in this repository describing your suggestion. This would enable us to label and track it properly. You can do the same if you encounter a problem with the feature as well.

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

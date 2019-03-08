/*****************************************************************************
 * Open MCT, Copyright (c) 2014-2018, United States Government
 * as represented by the Administrator of the National Aeronautics and Space
 * Administration. All rights reserved.
 *
 * Open MCT is licensed under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * http://www.apache.org/licenses/LICENSE-2.0.
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 *
 * Open MCT includes source code licensed under additional open source
 * licenses. See the Open Source Licenses file (LICENSES.md) included with
 * this source code distribution or the Licensing information page available
 * at runtime from the About dialog for additional information.
 *****************************************************************************/

define(['zepto'], function ($) {

    /**
     * The ImportAsJSONAction is available from context menus and allows a user
     * to import a previously exported domain object into any domain object
     * that has the composition capability.
     *
     * @implements {Action}
     * @constructor
     * @memberof platform/import-export
     */
    function ImportAsJSONAction(
        exportService,
        identifierService,
        dialogService,
        openmct,
        context
    ) {

        this.openmct = openmct;
        this.context = context;
        this.exportService = exportService;
        this.dialogService = dialogService;
        this.identifierService = identifierService;
        this.instantiate = openmct.$injector.get("instantiate");
    }

    ImportAsJSONAction.prototype.perform = function () {
        this.dialogService.getUserInput(this.getFormModel(), {})
            .then(function (form) {
                var objectTree = form.selectFile.body;
                if (this.validateJSON(objectTree)) {
                    this.importObjectTree(JSON.parse(objectTree));
                } else {
                    this.displayError();
                }
            }.bind(this));
    };

    ImportAsJSONAction.prototype.importObjectTree = function (objTree) {
        var parent = this.context.domainObject;
        var tree = this.generateNewIdentifiers(objTree);
        var rootId = tree.rootId;
        var rootObj = this.instantiate(tree.openmct[rootId], rootId);

        // Instantiate all objects in tree with their newly genereated ids,
        // adding each to its rightful parent's composition
        rootObj.getCapability("location").setPrimaryLocation(parent.getId());
        this.deepInstantiate(rootObj, tree.openmct, []);
        parent.getCapability("composition").add(rootObj);
    };

    ImportAsJSONAction.prototype.deepInstantiate = function (parent, tree, seen) {
        // Traverses object tree, instantiates all domain object w/ new IDs and
        // adds to parent's composition
        if (parent.hasCapability("composition")) {
            var parentModel = parent.getModel();
            var newObj;

            seen.push(this.getKeyString(parent.getId()));
            parentModel.composition.forEach(function (childId, index) {
                var childIdString = this.getKeyString(childId);
                if (!tree[childIdString] || seen.includes(childIdString)) {
                    return;
                }

                newObj = this.instantiate(tree[childIdString], childIdString);
                // New object has not been persisted yet so clear persisted
                // timestamp from copied model.
                delete newObj.getModel().persisted;
                newObj.getCapability('persistence').persist();
                this.deepInstantiate(newObj, tree, seen);
            }, this);
        }
    };

    ImportAsJSONAction.prototype.generateNewIdentifiers = function (tree) {
        // For each domain object in the file, generate new ID, replace in tree
        Object.keys(tree.openmct).forEach(function (domainObjectId) {
            var newId = this.identifierService.generate();
            tree = this.rewriteId(domainObjectId, newId, tree);
        }, this);
        return tree;
    };

    ImportAsJSONAction.prototype.getKeyString = function (identifier) {
        return this.openmct.objects.makeKeyString(identifier);
    };

    /**
     * Rewrites all instances of a given id in the tree with a newly generated
     * replacement to prevent collision.
     *
     * @private
     */
    ImportAsJSONAction.prototype.rewriteId = function (oldID, newID, tree) {
        tree = JSON.stringify(tree).replace(new RegExp(oldID, 'g'), newID);
        return JSON.parse(tree);
    };

    ImportAsJSONAction.prototype.getFormModel = function () {
        return {
            name: "Import as JSON",
            sections: [
                {
                    name: "Import A File",
                    rows: [
                        {
                            name: 'Select File',
                            key: 'selectFile',
                            control: 'file-input',
                            required: true,
                            text: 'Select File'
                        }
                    ]
                }
            ]
        };
    };

    ImportAsJSONAction.prototype.validateJSON = function (jsonString) {
        var json;
        try {
            json = JSON.parse(jsonString);
        } catch (e) {
            return false;
        }
        if (!json.openmct || !json.rootId) {
            return false;
        }
        return true;
    };

    ImportAsJSONAction.prototype.displayError = function () {
        var dialog,
        model = {
            title: "Invalid File",
            actionText:  "The selected file was either invalid JSON or was " +
                "not formatted properly for import into Open MCT.",
            severity: "error",
            options: [
                {
                    label: "Ok",
                    callback: function () {
                        dialog.dismiss();
                    }
                }
            ]
        };
        dialog = this.dialogService.showBlockingMessage(model);
    };

    ImportAsJSONAction.appliesTo = function (context) {
        return context.domainObject !== undefined &&
            context.domainObject.hasCapability("composition");
    };

    return ImportAsJSONAction;
});

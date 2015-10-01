var gObserversCollection = null,
    gEventsCollection = null;

function meteorStart(collections) {
    Session.set('ganttReady', false);
    gObserversCollection = new DataCollection();
    gEventsCollection = new DataCollection();

    var collectionsCursors = {
        tasks: null,
        links: null
    };

    if(arguments.length == 2) {
        collectionsCursors = arguments[0];
        collections = arguments[1];
    }
    else {
        collectionsCursors["tasks"] = collections["tasks"].find({}, {sort:{
            start_date:1,
            end_date: 1,
            createdAt: 1
        }});
        collectionsCursors["links"] = collections["links"].find();
    }


    var collection = {
        data: collectionsCursors["tasks"].fetch().map(function (task) {return parseItemData(task)}),
        links: collectionsCursors["links"].fetch()
    };

    console.log(collection);

    gantt.parse(collection);

    initCollectionHandler(this, collections["tasks"], collectionsCursors["tasks"], "task", collections["links"]);
    initCollectionHandler(this, collections["links"], collectionsCursors["links"], "link");

}

function meteorStop() {
    if(gObserversCollection) {
        gObserversCollection.each(function(observer) {
            console.log(observer);
            observer.stop();
            console.log(observer);
        });
        gObserversCollection.clean();
    }

    var self = this;
    if(gEventsCollection) {
        gEventsCollection.each(function(eventId) {
            console.log(self.detachEvent);
            self.detachEvent(eventId);
        });
        gEventsCollection.clean();
    }
    gantt.clearAll();

}

function initCollectionHandler(gantt, collection, collectionCursor, itemType, linksCollection) {
    var itemTypeSettings = getItemTypeSettings(gantt, itemType),
        eventsNames = itemTypeSettings.events_names;

    var collectionHandlerObj = new CollectionHandler(collection);
    gEventsCollection.add(gantt.attachEvent("onTaskLoading", function(task) {
        collectionHandlerObj.save(task);
        return true;
    }));

    gEventsCollection.add(gantt.attachEvent(eventsNames.added, function(itemId, item) {
        console.log('adding');
        collectionHandlerObj.save(item);
        return true;
    }));

    gEventsCollection.add(gantt.attachEvent(eventsNames.updated, function(itemId, item) {
        console.log('updating');

        collectionHandlerObj.save(item);
    }));

    gEventsCollection.add(gantt.attachEvent(eventsNames.removed, function(itemId, item) {
        console.log('removing');
        console.log(itemId);
        console.log(item);
        collectionHandlerObj.remove(itemId, item);
    }));


    if (linksCollection) {
        gEventsCollection.add(gantt.attachEvent("onAfterTaskDrag", function (id, e) {
            console.log('done dragging');
            var links, task;

            links = linksCollection.find({$or:[{source:id},{target:id}]}).fetch();
            links.forEach(function (link) {
                if (!link.linkType || link.linkType === "hard"){
                    if (link.source === id && link.target) {
                        task = gantt.getTask(link.target);
                        gantt.roundTaskDates(task);
                        gantt.updateTask(link.target);
                    } else if (link.target === id && link.source) {
                        task = gantt.getTask(link.source);
                        gantt.roundTaskDates(task);
                        gantt.updateTask(link.source);
                    }
                }

            });
        }));

        gEventsCollection.add(gantt.attachEvent("onTaskDrag", function (id, mode, copy, original, e) {
            var dependencies,
                links, obj,
                diff = new Date(original.start_date).getTime() - new Date(copy.start_date).getTime();
            if (mode === "move") {
                links = linksCollection.find({$or:[{source:copy._id},{target:copy._id}]}).fetch();
                links.forEach(function (link) {
                    if (link && link.linkType && link.linkType === "hard") {
                        console.log(copy);
                        console.log(link);
                        if (link.source === copy._id && link.target) {
                            console.log('yooo');
                            console.log(link.target);
                            dependencies = gantt.getTask(link.target.toString());
                            if (dependencies && dependencies.start_date) {
                                dependencies.start_date = new Date(new Date(dependencies.start_date).getTime() - diff);
                                dependencies.end_date = new Date(new Date(dependencies.end_date).getTime() - diff);

                                gantt.updateTask(link.target);
                                //gantt.roundTaskDates(dependencies);
                            }
                        } else if (link.target === copy._id && link.source){
                            dependencies = gantt.getTask(link.source.toString());
                            if (dependencies && dependencies.start_date) {
                                dependencies.start_date = new Date(new Date(dependencies.start_date).getTime() - diff);
                                dependencies.end_date = new Date(new Date(dependencies.end_date).getTime() - diff);
                                console.log('yo');
                                gantt.updateTask(link.source);
                                //gantt.roundTaskDates(dependencies);
                            }
                        }
                    }
                });
            }
        }));
    } else {
        gEventsCollection.add(gantt.attachEvent("onLinkClick", function (id, e) {
            console.log(e);
            var link = gantt.getLink(id),
                linkType;
            if (link.linkType && link.linkType === "hard"){
                linkType = "soft";
                link.linkType = linkType;
            } else {
                linkType = "hard";
                link.linkType = linkType;
            }
            collection.update({_id:link._id}, {$set:{
                linkType: linkType
            }});

            gantt.updateLink(id)

        }));
    }

    var methods = itemTypeSettings.methods;
    gObserversCollection.add(collectionCursor.observe({

        //added: function(data) {
        //    var itemData = parseItemData(data);
        //    console.log('add');
        //    if(!methods.isExists(itemData._id))
        //        methods.add(itemData);
        //},

        changed: function(data) {
            var itemData = parseItemData(data);

            if(!methods.isExists(itemData._id))
                return false;

            console.log(itemData);

            var item = methods.get(itemData.id);
            for(var key in itemData)
                item[key] = itemData[key];

            console.log('yo');
            console.log(itemData);
            methods.update(itemData._id);
            return true;
        },

        removed: function(data) {
            console.log(data);
            if(methods.isExists(data._id)) {
                console.log('exists');
                methods.remove(data._id);
            }
        }

    })
    );

}

function getItemTypeSettings(gantt, itemType) {
    var methods = {
        isExists: function() {},
        get: function() {},
        add: function() {},
        update: function() {},
        remove: function() {}
    },
    eventsNames = {
        added: "",
        updated: "",
        removed: ""
    };

    function isExistsItem(itemId) {
        return (itemId != null);
    }

    switch(itemType) {
        case "task":
            methods.isExists = function(taskId) {return (isExistsItem(taskId) && gantt.isTaskExists(taskId))};
            methods.get = gantt.getTask;
            methods.add = gantt.addTask;
            methods.update = gantt.updateTask;
            methods.remove = gantt.deleteTask;
            eventsNames.added = "onAfterTaskAdd";
            eventsNames.updated = "onAfterTaskUpdate";
            eventsNames.removed = "onAfterTaskDelete";
            break;

        case "link":
            methods.isExists = function(linkId) {return (isExistsItem(linkId) && gantt.isLinkExists(linkId))};
            methods.get = gantt.getLink;
            methods.add = gantt.addLink;
            methods.update = gantt.updateLink;
            methods.remove = gantt.deleteLink;
            eventsNames.added = "onAfterLinkAdd";
            eventsNames.updated = "onAfterLinkUpdate";
            eventsNames.removed = "onAfterLinkDelete";
            break;
    }

    for(var method in methods)
        methods[method] = methods[method].bind(gantt);

    return {methods: methods, events_names: eventsNames};
}

function CollectionHandler(collection) {

    this.save = function(item) {
        item = parseItemData(item);
        item.projectId = Session.get('projectId');
        var savedItemData = this.findItem(item._id);

        if(savedItemData){
            if (item.hasOwnProperty("text")) {
                console.log(savedItemData);
                collection.update({_id: savedItemData._id}, {
                    $set: {
                        text: item.text,
                        start_date: item.start_date,
                        end_date: item.end_date,
                        duration: item.duration
                    }
                });
            } else {
                console.log(item);
                collection.update({_id: savedItemData._id}, {
                    $set: {
                        source: item.source,
                        target: item.target
                    }
                });
            }
        }
        else {
            if (item.source) {
                item.linkType = "hard";
            }
            console.log(item);
            console.log('insertting');
            collection.insert(item);
        }
    };

    this.remove = function(itemId, item) {
        if (item && item._id) {
            collection.remove({_id:item._id});
        } else {
            var Item = collection.findOne({source:item.source, target:item.target});
            collection.remove({_id:Item._id});
        }
    };

    this.findItem = function(itemId) {
        return collection.findOne({_id: itemId});
    };
}

function parseItemData(item) {
    var itemData = {};
    for(var itemProperty in item) {

        // can't imagine what this is
        if((itemProperty.charAt(0) == "$"))
            continue;

        if(itemProperty == "id") {
            itemData["id"] = itemData["_id"];
        } else {
            itemData[itemProperty] = item[itemProperty];
        }
    }

    return itemData;
}

function DataCollection() {
    var collectionData = {},
        currentUid = new Date().valueOf();

    function _uid() {
        return currentUid++;
    }

    this.add = function(data) {
        var dataId = _uid();
        collectionData;
        collectionData[dataId] = data;
        return dataId;
    };

    this.each = function(handler) {
        for(var key in collectionData) {
            handler.call(this, collectionData[key]);
        }
    };

    this.clean = function() {
        collectionData = {};
    };
}



function initGanttMeteor(gantt) {
    gantt.meteor = meteorStart;
    gantt.meteorStop = meteorStop;
}

if(window.Gantt) {
    Gantt.plugin(function(gantt) {
        initGanttMeteor(gantt);
    });
}
else
    initGanttMeteor(gantt);
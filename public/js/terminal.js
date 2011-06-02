var term;

var help = [
  '%+r github terminal help %-r',
  '',
  '= Navigating =============================================',
  '',
  '  ls              %c(@tan)see your context.',
  '  cd <dir>        %c(@tan)change your context.',
  '',
  '= Editing and Committing =================================',
  '',
  '  log             %c(@tan)view a commit log when in a branch',
  '  edit <file>     %c(@tan)edit a file, which is staged after the edit',
  '  status          %c(@tan)see which files are staged for the next commit',
  '  unstage <file>  %c(@tan)remove a change from your staging area',
  '  commit <msg>    %c(@tan)commit your staged changes to the current branch',
  '',
  '  help            %c(@tan)to see this page.',
  ' '
];


function termInitHandler() {
  // output a start up screen
  this.write(
    [
      '              ****           github terminal            ****',
      '%c()%n'
    ]
  );
  // and leave with prompt
  this.prompt();
}


function termHandler() {
  var parser = new Parser();
  parser.parseLine(this);
  var command = this.argv[this.argc++];

  this.newLine()

  if (command == null) {
    // blank line
  } else if (command == 'help') {
    this.clear()
    help.forEach(function(line) {
      term.write(line + '%n')
    })
    nextTerm()
  } else if (command == 'ls') {
    listCurrent()
  } else if (command == 'cd') {
    var newState = this.argv[this.argc++];
    newState.split("/").forEach(function(dir) {
      changeState(dir)
    })
  } else if (command == 'log') {
    runLog(this.argv)
  } else if (command == 'status') {
    runStatus()
  } else if (command == 'test') {
    runTest()
  } else if (command == 'commit') {
    runCommit()
  } else if (command == 'unstage') {
    var path = this.argv[this.argc++];
    runUnstage(path)
  } else if ((command == 'edit') || (command == 'vim') || (command == 'emacs')) {
    var fileName = this.argv[this.argc++];
    startEditor(fileName, command)
  } else {
    nextTerm(command + " not a command. type 'help' for commands")
  }
}

// sets up env for feature dev
var commandStack = []
var commandTimer = 500
function runTest() {
  commandStack = []
  commandStack.push("listCurrent()")
  commandStack.push("changeState('github')")
  commandStack.push("listCurrent()")
  commandStack.push("changeState('master')")
  commandStack.push("listCurrent()")
  commandStack.push("startEditor('config.ru')")
  commandStack.push("editor.getSession().setValue('hey new content')")
  commandStack.push("stopEditor()")
  commandStack.push("changeState('config')")
  commandStack.push("listCurrent()")
  commandStack.push("startEditor('shotgun.rb')")
  commandStack.push("editor.getSession().setValue('hey more new content')")
  commandStack.push("stopEditor()")
  commandStack.push("changeState('..')")
  setTimeout("runNext()", commandTimer)
}
function runNext() {
  if(cmd = commandStack.shift()) {
    eval(cmd)
    setTimeout("runNext()", commandTimer)
  }
}
// -- sets up env for feature dev --


function runUnstage(path) {
  if(ghStage.length > 0) {
    newStage = []
    ghStage.forEach(function(entry) {
      if(entry.path != path) {
        newStage.push(entry)
      } else {
        term.write("Removed " + path + '%n')
      }
    })
    ghStage = newStage
  }
  nextTerm()
}

function runStatus() {
  if(ghStage.length > 0) {
    term.write("Parent Commit: %c(@indianred)" + ghStageCommit + "%n")
    // TODO: check ghCommit sha matches, else the commit will fail
    ghStage.forEach(function(entry) {
      writePadded('@lightblue', 'M', 2)
      writePadded('@lightyellow', entry.sha.substring(0, 10), 10)
      writePadded('@cornflowerblue', entry.path, 50)
      term.newLine()
    })
  } else {
    term.write("Nothing modified")
  }
  nextTerm()
}

function runCommit() {

  if(ghStage.length <= 0) {
    return nextTerm("Nothing staged for commit%n")
  }
  if(ghStageCommit != ghCommit.sha) {
    return nextTerm("Stage commit is mismatched%n")
  }

  term.write("Base Tree:                   %c(@khaki)" + ghCommit.cache.tree + '%n')
  tr = {}
  tr.base_tree = ghCommit.cache.tree
  tr.tree = ghStage
  term.write("Writing the new tree...")
  var tree = ghRepo.tree()
  tree.write(tr, function(resp) {
    cm = {}
    cm.tree = resp.sha
    cm.message = "test message"
    cm.parents = [ghStageCommit]
    addNewObject('tree', resp)
    term.write(" tree %c(@lightyellow)" + resp.sha + "%n")
    term.write("Committing files...  ")
    var commit = ghRepo.commit()
    commit.write(cm, function(resp) {
      addNewObject('commit', resp)
      term.write(" commit %c(@lightyellow)" + resp.sha + "%n")
      term.write("Updating branch...")
      var ref = ghRepo.ref(ghBranch.ref, ghBranch.sha)
      ref.update(resp.sha, function(resp) {
        nextTerm("           %c(@lightblue)Branch Updated")
        ghBranch.sha = resp.sha
      })
    })
  })
}

function changeState(newState) {
  if (newState == '..') {
    if(currentState == 'path') {
      ghPath.pop()
    }
    popState()
    return nextTerm()
  }
  if(currentState == 'top') { // top level - cd'ing to a repo state
    for(i = 0; i <= ghRepos.length - 1; i++) {
      if(ghRepos[i].name == newState) {
        ghRepo = gh.repo(ghUser.username, ghRepos[i].name)
        pushState('repo', ghRepo.repo)
        return nextTerm()
      }
    }
  } else if (currentState == 'repo') {
    for(i = 0; i <= ghBranches.length - 1; i++) {
      var name = ghBranches[i].ref.replace('refs/heads/', '')
      if(name == newState) {
        ghBranch = ghBranches[i]
        if(ghBranch.sha != ghStageCommit) {
          term.write("%c(@indianred)New Stage%n")
          ghStageCommit = ghBranch.sha
          ghStage = []
        }
        pushState('branch', name)
        return nextTerm()
      }
    }
  } else if ((currentState == 'branch') || (currentState == 'path')) {
    var subtree = getCurrentSubtree(false)
    for(i = 0; i <= subtree.count - 1; i++) {
      var name = subtree.tree[i].path;
      if(name == newState) {
        ghPath.push(name)
        pushState('path', name)
        return nextTerm()
      }
    }
  }
  nextTerm("unknown state: " + newState)
}

function runLog(log) {
  if(currentState == 'branch' || currentState == 'path') {
    // show commits
    ghCommit = gh.commit(ghRepo.user, ghRepo.repo, ghBranch.sha)
    ghCommit.list(function(resp) {
      commits = resp.data
      commits.forEach(function(commit) {
        writePadded("@green",  commit.sha.substring(0, 8), 8)
        writePadded("@cornflowerblue",   commit.author.date.substring(5, 10), 5)
        writePadded("@lightblue",   commit.author.email, 10)
        writePadded("@wheat", commit.message.split("\n").pop(), 50)
        term.newLine()
      })
      nextTerm()
    })
  } else {
    nextTerm("ERR: you must cd to the branch of a repo first")
  }
}

// write a listing of the current state
function listCurrent() {
  if(currentState == 'top') {
    ghUser.allRepos(function (data) {
      ghRepos = data.repositories
      $("#message").text("Number of repos: " + ghRepos.length)
      writeRepos()
    });
  } else if(currentState == 'repo') {
    ghRepo.branches(function (data) {
      ghBranches = data.data
      $("#message").text("Number of branches: " + ghBranches.length)
      writeBranches()
    })
  } else if(currentState == 'branch') {
    ghCommit = gh.commit(ghRepo.user, ghRepo.repo, ghBranch.sha)
    ghCommit.show(function(resp) {
      data = resp.data
      ghCommit.cache = data
      showCommit()
      ghCommit.subTree = {}
      showTree(data.tree, '/')
    })
  } else if(currentState == 'path') {
    // use data from ghPath to get a tree sha from treecache
    showCommit()
    sha = findTreeSha(getCurrentDir(), true)
    showTree(sha, currentPath())
  } else {
    term.write("unknown state")
    nextTerm()
  }
}

function getCurrentDir() {
  var tmpPath = ghPath.slice()
  return tmpPath.pop()
}

function findTreeSha(path, pop) {
  var subtree = getCurrentSubtree(pop)
  for(i = 0; i <= subtree.count - 1; i++) {
    var tree = subtree.tree[i]
    if(tree.path == path) {
      return tree.sha
    }
  }
}

function getCurrentSubtree(pop) {
  var tmpPath = ghPath.slice()
  if(pop)
    path = tmpPath.pop()
  relPath = '/' + tmpPath.join('/')
  return ghCommit.subTree[relPath]
}

function currentPath() {
  return "/" + ghPath.join('/')
}

function treePath() {
  if(ghPath.length > 0) {
    return ghPath.join('/') + '/'
  } else {
    return ''
  }
}

function showCommit() {
  data = ghCommit.cache
  term.write("commit : %c(@lightyellow)" + data.sha + '%n')
  term.write("tree   : %c(@lightyellow)" + data.tree + '%n')
  term.write("author : " + data.author.name + '%n')
  term.write("date   : %c(@indianred)" + data.author.date + '%n')
  term.write("path   : " + currentPath() + '%n')
  term.write('%n')
}

function showTree(sha, path) {
  var tree = ghRepo.tree(sha)
  tree.show(function(resp) {
    data = resp.data
    ghCommit.subTree[path] = data
    data.tree.forEach(function(entry) { 
      if(entry.type == 'tree') {
        color = '@lightskyblue'
        writePadded(color, entry.path, 68)
      } else {
        color = '@lemonchiffon'
        writePadded(color, entry.path, 57)
        color = '@lightcyan'
        writePadded(color, entry.size + '', 10)
      }
      term.write(entry.sha.substring(0, 10) + "%n")
    })
    nextTerm()
  })
}


function nextTerm(line) {
  if(line){
    term.write(line)
  }
  term.newLine()
  term.prompt()
}

// list branches
function writeBranches() {
  if(!ghBranches)
    return false
  ghBranches.forEach(function (branch) {
    name = branch.ref.replace('refs/heads/', '')
    term.write("%c(@lightyellow)" + name)
    term.newLine()
  })
  nextTerm()
}

// list repositories
function writeRepos() {
  if(!ghRepos)
    return false
  ghRepos.forEach(function (repo) {
    term.write("%c(@lightblue)" + repo.name)
    term.newLine()
  })
  nextTerm()
}


function writePadded(color, str, len) {
  if (str.length > len) {
    str = str.substring(0, len - 2) + '..'
  }
  if(color) {
    color = "%c(" + color + ")"
  }
  term.write(color + str + " ")
  rest = len - str.length
  for(j = 1; j <= rest; j++) {
    term.write(" ")
  }
}

function pushState(state, desc) {
  stateStack.push([state, desc])
  currentState = state
  setPs(desc + "[" + state + "]")
}

function popState() {
  if(stateStack.length <= 1) {
    term.write("%c(@indianred)ERR: at the top")
    return false
  }
  stateStack.pop()
  arr = stateStack[stateStack.length - 1]
  state = arr[0]
  desc = arr[1]
  currentState = state
  setPs(desc + "[" + state + "]")
}

function setPs(str) {
  lastPs = str.substr(0, 20) + ' $'
  term.ps = lastPs
}

function resetPs(str) {
  term.ps = lastPs
}

function startEditor(fileName, type) {
  if(sha = findTreeSha(fileName, false)) {
    lastEditPath = treePath() + fileName
    var blob = ghRepo.blob(sha)
    blob.show(function(resp) {
      b = resp.data
      if (b.content) {
        content = blob.decode(b.content)
        term.close()
        TermGlobals.keylock = true
        $("#termDiv").hide()
        $("#editor").show()
        editor = ace.edit("editorDiv")
        editor.getSession().setValue(content)
        editor.gotoLine(1)
        if(type == 'vim') {
          vim = require("ace/keyboard/keybinding/vim").Vim;
          editor.setKeyboardHandler(vim)
        }
        if(type == 'emacs') {
          emacs = require("ace/keyboard/keybinding/emacs").Emacs;
          editor.setKeyboardHandler(emacs)
        }
      }
      nextTerm()
    })
  } else {
    nextTerm("%c(@indianred)" + fileName + " is not a file in this context")
  }
}

function stopEditor() {
  $("#editor").hide()
  $("#termDiv").show()

  content = editor.getSession().getValue()
  var blob = ghRepo.blob()
  blob.write(content, function(resp) {
    addNewObject('blob', resp)
    ghStage.push({'path': lastEditPath, 'type': 'blob', 'sha': resp.sha, 'mode': '100644'})
    term.write("File '" + lastEditPath + "' saved %c(@lightyellow)(" + resp['sha'] + ")")
    term.prompt()
  })

  TermGlobals.keylock = false
  term.open()
  resetPs()
}

function addNewObject(type, data) {
  newObjects.push([type, data, ghRepo.user, ghRepo.repo])
  newObjects = newObjects.slice(0, 10)

  $('#newObjects').empty()
  $('#newObjects').append("<h3><a href='#'>New Objects</a></h3>")
  var list = $("<ul>")
  newObjects.forEach(function(obj) {
    if(obj[0] == 'commit') {
      url = "http://github.dev/" + obj[2] + "/" + obj[3] + "/" + obj[0] + "/" + obj[1].sha
    } else {
      url = '#'
    }
    list.prepend("<li><span><a href='" + url + "'><code>" + obj[1].sha.substring(0, 10) + "</code></a> &nbsp;  " +  obj[0] + "</span></li>")
  })
  $('#newObjects').append(list)
}

// Open the Terminal

function startTerminal() {
  term = new Terminal(
    {
      cols: 80,
      rows: 27,
      termDiv: 'termDiv',
      initHandler: termInitHandler,
      handler: termHandler
    }
  )
  pushState('top', ghLogin)
  term.open()
}

var ghUser  = null
var ghLogin = null
var ghRepos = null
var ghRepo  = null
var ghBranches = null
var ghBranch   = null
var ghCommit = null
var ghStage = []
var ghStageCommit = null
var ghPath = []
var lastEditPath = ''

var newObjects = []

var currentState = 'top'
var stateStack = []
var lastPs = null

var editor = null

$(function() {
  $("#editDone").click(function() {
    stopEditor()
  })

  token = $("#token").attr("value")
  ghLogin = $("#login").attr("value")

  ghUser = gh.user(ghLogin)
  gh.authenticate(token)

  startTerminal()
})


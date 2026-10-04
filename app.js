/**
 * VIT Aero Alumni Connect
 * GitHub Pages frontend
 *
 * Public data:
 *   Google Sheets -> Apps Script -> GitHub data/*.json
 *
 * Registration:
 *   GitHub form -> Apps Script doPost -> Google Sheet
 */

const AAC_CONFIG = {
  portalName: 'VIT Aero Alumni Connect',
  apiUrl: 'https://script.google.com/macros/s/AKfycbwYyPW2_lJM9gwf0CqluTGfk8e7RhC48Wus1c19c8U0-WZAQU9mv28GKsJlUgh2KgV2OA/exec',

  // Primary source: raw GitHub content. This avoids GitHub Pages deployment
  // caching and makes Sheet -> GitHub publication visible immediately.
  rawDataBase:
    'https://raw.githubusercontent.com/vitaeroalumni/aero-alumni-connect/main/data/',

  // Fallback source if raw GitHub is temporarily unavailable.
  pagesDataBase: './data/',

  // Apps Script HTMLService responses may originate from either host.
  backendMessageOrigins: [
    'https://script.google.com',
    'https://script.googleusercontent.com'
  ],

  // Fast live source. Public records are read from Apps Script JSONP first;
  // GitHub JSON remains the fallback/mirror.
  publicDataAction: 'publicData'
};

document.addEventListener('DOMContentLoaded', function() {
  setYear();
  initMobileNavigation();
  initRegistrationForm();
  initDirectoryPage();
  initContentPage();
});

function setYear() {
  document
    .querySelectorAll('[data-current-year]')
    .forEach(function(el) {
      el.textContent =
        new Date().getFullYear();
    });
}

function initMobileNavigation() {
  const toggle =
    document.querySelector('[data-menu-toggle]');

  const nav =
    document.querySelector('[data-mobile-nav]');

  if (!toggle || !nav) return;

  toggle.addEventListener('click', function() {
    const open =
      nav.classList.toggle('is-open');

    toggle.setAttribute(
      'aria-expanded',
      open ? 'true' : 'false'
    );
  });

  nav.querySelectorAll('a').forEach(function(link) {
    link.addEventListener('click', function() {
      nav.classList.remove('is-open');
      toggle.setAttribute(
        'aria-expanded',
        'false'
      );
    });
  });
}

/* =====================================================================
   REGISTRATION
   ===================================================================== */

function initRegistrationForm() {
  const form = document.getElementById('alumniRegistrationForm');
  if (!form) return;

  const statusBox = document.getElementById('registrationStatus');
  const submitButton = document.getElementById('submitRegistration');
  const frame = document.getElementById('registrationFrame');
  const requestIdField = document.getElementById('requestId');

  let activeRequestId = '';
  let responseTimer = null;
  let pollTimer = null;
  let pollCount = 0;
  let finished = false;

  function createRequestId() {
    return 'REQ-' + Date.now().toString(36) + '-' +
      Math.random().toString(36).slice(2, 12);
  }

  function finishRegistration(data) {
    if (finished || !data) return;
    if (activeRequestId && data.requestId && data.requestId !== activeRequestId) return;

    finished = true;
    if (responseTimer) clearTimeout(responseTimer);
    if (pollTimer) clearTimeout(pollTimer);
    responseTimer = null;
    pollTimer = null;
    setSubmitState(submitButton, false);

    if (data.success) {
      showStatus(
        statusBox,
        'success',
        (data.message || 'Registration submitted successfully.') +
          (data.alumniId ? ' Your Alumni ID is ' + data.alumniId + '.' : '')
      );
      form.reset();
      if (requestIdField) requestIdField.value = '';
      activeRequestId = '';
    } else {
      showStatus(statusBox, 'error', data.message || 'Registration could not be submitted.');
    }
  }

  // Primary response path: Apps Script HTML response -> postMessage.
  window.addEventListener('message', function(event) {
    if (!frame || event.source !== frame.contentWindow) return;
    const data = event.data;
    if (!data || data.type !== 'VIT_AERO_ALUMNI_REGISTRATION') return;
    finishRegistration(data);
  });

  // Reliable fallback: JSONP polling asks Apps Script whether the exact
  // request id has been committed to Google Sheets. JSONP avoids CORS.
  function pollRegistrationStatus() {
    if (!activeRequestId || finished) return;

    pollCount += 1;
    const callbackName = '__aacRegistration_' +
      Date.now().toString(36) + '_' + pollCount;
    const script = document.createElement('script');
    let cleaned = false;

    function cleanup() {
      if (cleaned) return;
      cleaned = true;
      try { delete window[callbackName]; } catch (ignore) {}
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    window[callbackName] = function(data) {
      cleanup();
      if (data && data.success) {
        finishRegistration({
          type: 'VIT_AERO_ALUMNI_REGISTRATION',
          success: true,
          message: data.message,
          alumniId: data.alumniId || '',
          requestId: activeRequestId
        });
        return;
      }

      if (!finished && pollCount < 30) {
        pollTimer = setTimeout(pollRegistrationStatus, 650);
      }
    };

    script.onerror = function() {
      cleanup();
      if (!finished && pollCount < 30) {
        pollTimer = setTimeout(pollRegistrationStatus, 800);
      }
    };

    script.src = AAC_CONFIG.apiUrl +
      '?action=registrationStatus' +
      '&request_id=' + encodeURIComponent(activeRequestId) +
      '&callback=' + encodeURIComponent(callbackName) +
      '&_=' + Date.now();

    document.head.appendChild(script);
  }

  form.addEventListener('submit', function(event) {
    clearStatus(statusBox);

    if (!form.checkValidity()) {
      event.preventDefault();
      form.reportValidity();
      return;
    }

    activeRequestId = createRequestId();
    finished = false;
    pollCount = 0;

    if (requestIdField) requestIdField.value = activeRequestId;
    setSubmitState(submitButton, true);

    // Do NOT preventDefault: the normal form POST to the hidden iframe is
    // the actual write operation. The JSONP poll only confirms the result.
    pollTimer = setTimeout(pollRegistrationStatus, 400);

    responseTimer = setTimeout(function() {
      if (finished) return;
      pollRegistrationStatus();
      responseTimer = setTimeout(function() {
        if (finished) return;
        setSubmitState(submitButton, false);
        showStatus(
          statusBox,
          'error',
          'The registration is taking longer than expected. Please do not submit again until you have checked Alumni_Master for the new entry.'
        );
        responseTimer = null;
      }, 5000);
    }, 20000);
  });
}

function setSubmitState(button, busy) {
  if (!button) return;

  if (!button.dataset.originalText) {
    button.dataset.originalText =
      button.textContent;
  }

  button.disabled =
    Boolean(busy);

  button.textContent =
    busy
      ? 'Submitting...'
      : button.dataset.originalText;
}

function showStatus(
  box,
  type,
  message
) {
  if (!box) return;

  box.hidden = false;
  box.className =
    'alert alert-' + type;
  box.textContent =
    message;
}

function clearStatus(box) {
  if (!box) return;

  box.hidden = true;
  box.className = 'alert';
  box.textContent = '';
}

/* =====================================================================
   DIRECTORY
   ===================================================================== */

function initDirectoryPage() {
  const page =
    document.querySelector(
      '[data-page="directory"]'
    );

  if (!page) return;

  const grid =
    document.getElementById(
      'directoryGrid'
    );

  const empty =
    document.getElementById(
      'directoryEmpty'
    );

  const loading =
    document.getElementById(
      'directoryLoading'
    );

  const errorBox =
    document.getElementById(
      'directoryError'
    );

  const search =
    document.getElementById(
      'directorySearch'
    );

  const year =
    document.getElementById(
      'directoryYear'
    );

  loadData('alumni.json')
    .then(function(payload) {

      const alumni =
        Array.isArray(payload.items)
          ? payload.items
          : [];

      if (loading) {
        loading.hidden = true;
      }

      populateYearFilter(
        year,
        alumni
      );

      renderDirectory(
        alumni,
        grid,
        empty,
        search,
        year
      );

      if (search) {
        search.addEventListener(
          'input',
          function() {
            renderDirectory(
              alumni,
              grid,
              empty,
              search,
              year
            );
          }
        );
      }

      if (year) {
        year.addEventListener(
          'change',
          function() {
            renderDirectory(
              alumni,
              grid,
              empty,
              search,
              year
            );
          }
        );
      }

    })
    .catch(function(error) {

      if (loading) {
        loading.hidden = true;
      }

      if (errorBox) {
        errorBox.hidden = false;

        errorBox.textContent =
          'The alumni directory could not be loaded. Please try again shortly.';
      }

      console.error(
        'Directory error:',
        error
      );

    });
}


function populateYearFilter(
  select,
  records
) {

  if (!select) return;

  const years =
    Array.from(
      new Set(
        records
          .map(function(item) {

            return String(
              pick(
                item,
                'Graduation_Year',
                'graduationYear'
              ) || ''
            ).trim();

          })
          .filter(Boolean)
      )
    ).sort(function(a, b) {

      return Number(b) - Number(a);

    });

  years.forEach(function(value) {

    const option =
      document.createElement('option');

    option.value = value;

    option.textContent = value;

    select.appendChild(option);

  });
}


function renderDirectory(
  records,
  grid,
  empty,
  search,
  year
) {

  if (!grid) return;

  const q =
    search
      ? search.value
          .trim()
          .toLowerCase()
      : '';

  const selectedYear =
    year ? year.value : '';

  const filtered =
    records.filter(function(item) {

      const haystack = [

        pick(
          item,
          'Full_Name',
          'fullName'
        ),

        pick(
          item,
          'Degree',
          'degree'
        ),

        pick(
          item,
          'Organization',
          'organization'
        ),

        pick(
          item,
          'Designation',
          'designation'
        ),

        pick(
          item,
          'Industry_Sector',
          'industrySector'
        ),

        pick(
          item,
          'Technical_Expertise',
          'technicalExpertise'
        ),

        pick(
          item,
          'Current_City',
          'currentCity'
        ),

        pick(
          item,
          'Current_Country',
          'currentCountry'
        )

      ]
        .join(' ')
        .toLowerCase();

      return (

        (!q ||
          haystack.indexOf(q) >= 0
        )

        &&

        (
          !selectedYear ||

          String(
            pick(
              item,
              'Graduation_Year',
              'graduationYear'
            )
          ) === selectedYear
        )

      );

    });

  grid.innerHTML = '';

  filtered.forEach(function(item) {

    grid.appendChild(
      alumniCard(item)
    );

  });

  if (empty) {

    empty.hidden =
      filtered.length !== 0;

  }

}


function alumniCard(item) {

  const card =
    document.createElement('article');

  card.className =
    'profile-card';


  /* -------------------------------------------------
     NAME
     ------------------------------------------------- */

  const name =
    document.createElement('h3');

  name.textContent =
    pick(
      item,
      'Full_Name',
      'fullName'
    ) ||
    'Alumni';


  /* -------------------------------------------------
     DEGREE + GRADUATION YEAR
     ------------------------------------------------- */

  const meta =
    document.createElement('p');

  meta.className =
    'profile-meta';

  const degree =
    pick(
      item,
      'Degree',
      'degree'
    );

  const year =
    pick(
      item,
      'Graduation_Year',
      'graduationYear'
    );

  meta.textContent =
    [
      degree,

      year
        ? 'Class of ' + year
        : ''

    ]
      .filter(Boolean)
      .join(' · ');


  /* -------------------------------------------------
     LOCATION
     ------------------------------------------------- */

  const location =
    document.createElement('p');

  location.className =
    'muted';

  location.textContent =
    [

      pick(
        item,
        'Current_City',
        'currentCity'
      ),

      pick(
        item,
        'Current_Country',
        'currentCountry'
      )

    ]
      .filter(Boolean)
      .join(', ');


  /* -------------------------------------------------
     APPEND BASIC PROFILE INFORMATION
     
     IMPORTANT:
     Current_Status
     Organization
     Designation

     are NOT displayed here.
     ------------------------------------------------- */

  card.appendChild(name);

  card.appendChild(meta);

  if (location.textContent) {

    card.appendChild(location);

  }


  /* -------------------------------------------------
     INDUSTRY / TECHNICAL EXPERTISE
     ------------------------------------------------- */

  const sector =
    pick(
      item,
      'Industry_Sector',
      'industrySector'
    );

  const expertise =
    pick(
      item,
      'Technical_Expertise',
      'technicalExpertise'
    );

  if (sector || expertise) {

    const tags =
      document.createElement('div');

    tags.className =
      'tag-list';

    [
      sector,
      expertise
    ]
      .filter(Boolean)
      .forEach(function(text) {

        const tag =
          document.createElement('span');

        tag.className =
          'tag';

        tag.textContent =
          text;

        tags.appendChild(tag);

      });

    card.appendChild(tags);

  }


  /* -------------------------------------------------
     ACTIONS
     ------------------------------------------------- */

  const actions =
    document.createElement('div');

  actions.className =
    'card-actions';


  /* -------------------------------------------------
     MENTOR BADGE
     ------------------------------------------------- */

  if (

    String(
      pick(
        item,
        'Interested_Mentoring',
        'interestedMentoring'
      )
    ).toLowerCase() === 'yes'

  ) {

    const badge =
      document.createElement('span');

    badge.className =
      'badge';

    badge.textContent =
      'Mentor';

    actions.appendChild(badge);

  }


  /* -------------------------------------------------
     LINKEDIN
     ------------------------------------------------- */

  const linkedin =
    pick(
      item,
      'LinkedIn_URL',
      'linkedinUrl'
    );

  if (linkedin) {

    const link =
      document.createElement('a');

    link.className =
      'text-link';

    link.href =
      safeUrl(linkedin);

    link.target =
      '_blank';

    link.rel =
      'noopener noreferrer';

    link.textContent =
      'LinkedIn';

    if (link.href) {

      actions.appendChild(link);

    }

  }


  /* -------------------------------------------------
     APPEND ACTIONS
     ------------------------------------------------- */

  if (actions.children.length) {

    card.appendChild(actions);

  }


  return card;

}
/* =====================================================================
   CONTENT PAGES
   ===================================================================== */

function initContentPage() {
  const page =
    document.querySelector(
      '[data-content-page]'
    );

  if (!page) return;

  const type =
    page.getAttribute(
      'data-content-page'
    );

  const config = {
    opportunities: {
      file: 'opportunities.json',
      renderer: renderOpportunity
    },
    achievements: {
      file: 'achievements.json',
      renderer: renderAchievement
    },
    activities: {
      file: 'activities.json',
      renderer: renderActivity
    },
    mentorship: {
      file: 'mentorship.json',
      renderer: renderMentorship
    }
  }[type];

  if (!config) return;

  const grid =
    document.getElementById(
      'contentGrid'
    );

  const empty =
    document.getElementById(
      'contentEmpty'
    );

  const loading =
    document.getElementById(
      'contentLoading'
    );

  const errorBox =
    document.getElementById(
      'contentError'
    );

  loadData(config.file)
    .then(function(payload) {
      const items =
        Array.isArray(payload.items)
          ? payload.items
          : [];

      if (loading) {
        loading.hidden = true;
      }

      grid.innerHTML = '';

      items.forEach(function(item) {
        grid.appendChild(
          config.renderer(item)
        );
      });

      if (empty) {
        empty.hidden =
          items.length !== 0;
      }
    })
    .catch(function(error) {
      if (loading) {
        loading.hidden = true;
      }

      if (errorBox) {
        errorBox.hidden = false;
        errorBox.textContent =
          'This section could not be loaded at this time. Please try again shortly.';
      }

      console.error(
        'Content page error:',
        error
      );
    });
}

/**
 * Primary source is raw.githubusercontent.com.
 * Fallback is the GitHub Pages /data directory.
 */
async function loadData(fileName) {
  const datasetMap = {
    'alumni.json': 'alumni',
    'opportunities.json': 'opportunities',
    'achievements.json': 'achievements',
    'activities.json': 'activities',
    'mentorship.json': 'mentorship'
  };

  const dataset = datasetMap[fileName];

  // 1. Live Google Sheets-backed data through Apps Script JSONP.
  if (dataset) {
    try {
      const live = await loadPublicDataJsonp(dataset, 7000);
      if (live && Array.isArray(live.items)) return live;
    } catch (error) {
      console.warn('Live public-data endpoint unavailable:', error);
    }
  }

  // 2. GitHub raw JSON mirror.
  const stamp = Date.now();
  const sources = [
    AAC_CONFIG.rawDataBase + fileName + '?v=' + stamp,
    AAC_CONFIG.pagesDataBase + fileName + '?v=' + stamp
  ];

  let lastError = null;
  for (const url of sources) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const payload = await response.json();
      if (!payload || !Array.isArray(payload.items)) {
        throw new Error('Invalid public data format.');
      }
      return payload;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('No public data source was available.');
}

function loadPublicDataJsonp(dataset, timeoutMs) {
  return new Promise(function(resolve, reject) {
    const callbackName = '__aacPublic_' +
      Date.now().toString(36) + '_' +
      Math.random().toString(36).slice(2, 8);
    const script = document.createElement('script');
    let settled = false;

    function cleanup() {
      try { delete window[callbackName]; } catch (ignore) {}
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    const timer = setTimeout(function() {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('Live public-data request timed out.'));
    }, timeoutMs || 7000);

    window[callbackName] = function(payload) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      if (!payload || payload.ok === false || !Array.isArray(payload.items)) {
        reject(new Error((payload && payload.error) || 'Invalid live public data.'));
        return;
      }
      resolve(payload);
    };

    script.onerror = function() {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      reject(new Error('Live public-data request failed.'));
    };

    script.src = AAC_CONFIG.apiUrl +
      '?action=' + encodeURIComponent(AAC_CONFIG.publicDataAction) +
      '&dataset=' + encodeURIComponent(dataset) +
      '&callback=' + encodeURIComponent(callbackName) +
      '&_=' + Date.now();

    document.head.appendChild(script);
  });
}

function renderOpportunity(item) {
  const card =
    baseContentCard(
      pick(item, 'Title', 'title') ||
        'Opportunity',
      pick(item, 'Type', 'type') ||
        'Opportunity'
    );

  addLine(
    card,
    pick(item, 'Organization', 'organization')
  );

  addLine(
    card,
    pick(item, 'Location', 'location')
  );

  addDescription(
    card,
    pick(item, 'Description', 'description')
  );

  addLabelValue(
    card,
    'Eligibility',
    pick(item, 'Eligibility', 'eligibility')
  );

  addLabelValue(
    card,
    'Deadline',
    pick(item, 'Deadline', 'deadline')
  );

  const url =
    pick(
      item,
      'Application_URL',
      'applicationUrl'
    );

  if (url) {
    addButton(
      card,
      url,
      'View Opportunity'
    );
  }

  return card;
}

function renderAchievement(item) {
  const card =
    baseContentCard(
      pick(item, 'Title', 'title') ||
        'Achievement',
      pick(item, 'Category', 'category') ||
        'Achievement'
    );

  const alumni =
    pick(
      item,
      'Alumni_Name',
      'alumniName'
    );

  const year =
    pick(
      item,
      'Graduation_Year',
      'graduationYear'
    );

  addLine(
    card,
    alumni
      ? alumni +
        (
          year
            ? ' · Class of ' +
              year
            : ''
        )
      : 'Alumni Achievement'
  );

  addDescription(
    card,
    pick(
      item,
      'Description',
      'description'
    )
  );

  addLabelValue(
    card,
    'Achievement Date',
    pick(
      item,
      'Achievement_Date',
      'achievementDate'
    )
  );

  if (
    String(
      pick(
        item,
        'Featured',
        'featured'
      )
    ).toLowerCase() === 'yes'
  ) {
    addBadge(
      card,
      'Featured'
    );
  }

  const url =
    pick(
      item,
      'External_URL',
      'externalUrl'
    );

  if (url) {
    addButton(
      card,
      url,
      'Read More'
    );
  }

  return card;
}

function renderActivity(item) {
  const card =
    baseContentCard(
      pick(item, 'Title', 'title') ||
        'Department Activity',
      pick(item, 'Type', 'type') ||
        'Department Activity'
    );

  addLine(
    card,
    pick(
      item,
      'Activity_Date',
      'activityDate'
    )
  );

  addLine(
    card,
    pick(item, 'Venue', 'venue')
  );

  addDescription(
    card,
    pick(
      item,
      'Description',
      'description'
    )
  );

  const url =
    pick(
      item,
      'Registration_URL',
      'registrationUrl'
    );

  if (url) {
    addButton(
      card,
      url,
      'Registration / Details'
    );
  }

  return card;
}

function renderMentorship(item) {
  const card =
    baseContentCard(
      pick(
        item,
        'Mentor_Name',
        'mentorName'
      ) ||
        'Alumni Mentor',
      pick(
        item,
        'Expertise',
        'expertise'
      ) ||
        'Mentorship'
    );

  addLine(
    card,
    [
      pick(
        item,
        'Industry',
        'industry'
      ),
      pick(
        item,
        'Mentoring_Mode',
        'mentoringMode'
      )
    ]
      .filter(Boolean)
      .join(' · ')
  );

  addLabelValue(
    card,
    'Availability',
    pick(
      item,
      'Availability',
      'availability'
    )
  );

  addDescription(
    card,
    pick(
      item,
      'Description',
      'description'
    )
  );

  const url =
    pick(
      item,
      'Contact_URL',
      'contactUrl'
    );

  if (url) {
    addButton(
      card,
      url,
      'Connect'
    );
  }

  return card;
}

/* =====================================================================
   DOM HELPERS
   ===================================================================== */

function pick(item, primary, secondary) {
  if (!item) return '';

  if (
    item[primary] !== undefined &&
    item[primary] !== null
  ) {
    return item[primary];
  }

  return secondary &&
    item[secondary] !== undefined &&
    item[secondary] !== null
      ? item[secondary]
      : '';
}

function baseContentCard(
  title,
  kicker
) {
  const card =
    document.createElement('article');

  card.className =
    'content-card';

  const small =
    document.createElement('p');

  small.className =
    'card-kicker';

  small.textContent =
    kicker || '';

  const h3 =
    document.createElement('h3');

  h3.textContent =
    title || 'Untitled';

  card.appendChild(small);
  card.appendChild(h3);

  return card;
}

function addLine(card, text) {
  if (!text) return;

  const p =
    document.createElement('p');

  p.className =
    'content-line';

  p.textContent =
    text;

  card.appendChild(p);
}

function addDescription(
  card,
  text
) {
  if (!text) return;

  const p =
    document.createElement('p');

  p.className =
    'content-description';

  p.textContent =
    text;

  card.appendChild(p);
}

function addLabelValue(
  card,
  label,
  value
) {
  if (!value) return;

  const p =
    document.createElement('p');

  p.className =
    'label-value';

  const strong =
    document.createElement('strong');

  strong.textContent =
    label + ': ';

  p.appendChild(strong);
  p.appendChild(
    document.createTextNode(
      value
    )
  );

  card.appendChild(p);
}

function addBadge(
  card,
  text
) {
  const span =
    document.createElement('span');

  span.className =
    'badge';

  span.textContent =
    text;

  card.appendChild(span);
}

function addButton(
  card,
  url,
  label
) {
  const safe =
    safeUrl(url);

  if (!safe) return;

  const wrap =
    document.createElement('div');

  wrap.className =
    'card-actions';

  const link =
    document.createElement('a');

  link.className =
    'button button-small button-solid';

  link.href =
    safe;

  link.target =
    '_blank';

  link.rel =
    'noopener noreferrer';

  link.textContent =
    label;

  wrap.appendChild(link);
  card.appendChild(wrap);
}

function safeUrl(value) {
  try {
    const url =
      new URL(
        String(value),
        window.location.href
      );

    if (
      url.protocol === 'https:' ||
      url.protocol === 'http:'
    ) {
      return url.href;
    }
  } catch (error) {
    return '';
  }

  return '';
}
